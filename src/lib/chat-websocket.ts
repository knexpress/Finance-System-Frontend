// WebSocket service for real-time chat updates
import { secureLog } from './secure-logger';

export interface ChatWebSocketMessage {
  type: 'new_message' | 'message_updated' | 'message_deleted' | 'typing' | 'user_online' | 'user_offline' | 'error';
  room_id?: string;
  message?: any;
  user_id?: string;
  is_typing?: boolean;
  error?: string;
}

export type ChatWebSocketCallback = (message: ChatWebSocketMessage) => void;

class ChatWebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private callbacks: Set<ChatWebSocketCallback> = new Set();
  private isConnecting = false;
  private shouldReconnect = true;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  constructor() {
    // Get WebSocket URL from environment or construct from API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws';
    // Remove http:// or https://, and remove trailing /api if present
    const wsHost = apiUrl.replace(/^https?:\/\//, '').replace(/\/api\/?$/, '');
    this.url = `${wsProtocol}://${wsHost}/api/chat/ws`;
    
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('authToken');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', token);
    }
    // Reconnect with new token if already connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.connect();
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
        resolve();
        return;
      }

      if (!this.token) {
        reject(new Error('No authentication token available'));
        return;
      }

      this.isConnecting = true;
      const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          secureLog.debug('WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat pong
            if (data.type === 'pong') {
              return;
            }

            // Notify all callbacks
            this.callbacks.forEach(callback => {
              try {
                callback(data as ChatWebSocketMessage);
              } catch (error) {
                secureLog.error('Error in WebSocket callback', error);
              }
            });
          } catch (error) {
            secureLog.error('Error parsing WebSocket message', error);
          }
        };

        this.ws.onerror = (error) => {
          // Silently handle WebSocket errors - server may not be available yet
          // Only log in debug mode, not as errors
          secureLog.debug('WebSocket connection attempt failed (server may not be available)', error);
          this.isConnecting = false;
          // Don't reject on first attempt - allow graceful fallback
          if (this.reconnectAttempts === 0) {
            // Resolve instead of reject to allow fallback to polling
            resolve();
          }
        };

        this.ws.onclose = (event) => {
          secureLog.debug('WebSocket closed', { code: event.code, reason: event.reason });
          this.isConnecting = false;
          this.stopHeartbeat();
          
          // Only attempt to reconnect if it was previously connected
          // Don't spam reconnection attempts if server doesn't exist
          if (this.shouldReconnect && event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            // Only reconnect if we had a successful connection before
            if (this.reconnectAttempts > 0 || event.code === 1006) {
              this.reconnectAttempts++;
              const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
              secureLog.debug(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
              setTimeout(() => {
                // Silently attempt reconnection without rejecting
                this.connect().catch(() => {
                  // Silently handle reconnection failures
                });
              }, delay);
            }
          }
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
  }

  subscribe(callback: ChatWebSocketCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  sendTyping(roomId: string, isTyping: boolean) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'typing',
        room_id: roomId,
        is_typing: isTyping
      }));
    }
  }

  joinRoom(roomId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'join_room',
        room_id: roomId
      }));
    }
  }

  leaveRoom(roomId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'leave_room',
        room_id: roomId
      }));
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const chatWebSocket = new ChatWebSocketService();

