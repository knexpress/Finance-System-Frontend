'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { chatWebSocket, type ChatWebSocketMessage } from '@/lib/chat-websocket';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  MessageSquare, Send, Users, Hash, Clock, CheckCircle2, UserPlus, 
  Search, X, Paperclip, Image as ImageIcon, Loader2, AlertCircle,
  ChevronLeft, Download, FileIcon
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secure-logger';

// ... existing interfaces ...
interface ChatRoom {
  _id: string;
  name: string;
  description?: string;
  room_type: 'department' | 'direct';
  department_ids?: Array<{
    _id: string;
    name: string;
    description?: string;
  }>;
  participants?: Array<{
    _id: string;
    full_name: string;
    email: string;
    employee_id?: string;
  }>;
  user_ids?: Array<{
    _id: string;
    full_name: string;
    email: string;
  }>;
  created_by?: {
    _id: string;
    full_name: string;
    email: string;
  };
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AvailableUser {
  _id: string;
  full_name: string;
  email: string;
  department: {
    _id: string;
    name: string;
    description?: string;
  };
  employee_id?: {
    _id: string;
    full_name: string;
    email: string;
  };
  role: string;
  isActive: boolean;
}

interface ChatMessage {
  _id: string;
  room_id: string;
  sender_id: {
    _id: string;
    full_name: string;
    email: string;
    employee_id?: string;
  };
  sender_department_id: {
    _id: string;
    name: string;
    description?: string;
  };
  message: string;
  message_type: 'text' | 'file' | 'image' | 'system';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  is_read: boolean;
  read_by: Array<{
    employee_id: string;
    read_at: string;
  }>;
  reply_to?: {
    _id: string;
    message: string;
    sender_id: {
      _id: string;
      full_name: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  currentRetries: number;
}

export default function ChatInterface() {
  const { userProfile, department } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<{ [roomId: string]: number }>({});
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showUserList, setShowUserList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [typingUsers, setTypingUsers] = useState<{ [roomId: string]: string[] }>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryConfig, setRetryConfig] = useState<RetryConfig>({
    maxRetries: 3,
    retryDelay: 1000,
    currentRetries: 0
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Retry helper function
  const retryOperation = useCallback(async <T,>(
    operation: () => Promise<T>,
    operationName: string,
    config: RetryConfig = retryConfig
  ): Promise<T | null> => {
    try {
      const result = await operation();
      setRetryConfig(prev => ({ ...prev, currentRetries: 0 }));
      setError(null);
      return result;
    } catch (error) {
      secureLog.error(`${operationName} failed`, error);
      
      if (config.currentRetries < config.maxRetries) {
        const newRetries = config.currentRetries + 1;
        setRetryConfig(prev => ({ ...prev, currentRetries: newRetries }));
        
        return new Promise((resolve) => {
          retryTimeoutRef.current = setTimeout(async () => {
            const result = await retryOperation(operation, operationName, {
              ...config,
              currentRetries: newRetries
            });
            resolve(result);
          }, config.retryDelay * Math.pow(2, newRetries - 1));
        });
      } else {
        setError(`${operationName} failed after ${config.maxRetries} attempts`);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `${operationName} failed. Please try again.`,
        });
        return null;
      }
    }
  }, [retryConfig, toast]);

  // Fetch employee ID from user profile
  useEffect(() => {
    const fetchEmployeeId = async () => {
      if (!userProfile) return;
      
      if (userProfile.employee_id) {
        setEmployeeId(userProfile.employee_id);
        return;
      }
      
      try {
        const employeesResponse = await retryOperation(
          () => apiClient.getEmployees(),
          'Fetch employee ID'
        );
        if (employeesResponse?.success && employeesResponse.data) {
          const employees = employeesResponse.data as any[];
          const employee = employees.find(
            (emp: any) => emp.email === userProfile.email
          );
          if (employee?._id) {
            setEmployeeId(employee._id);
            return;
          }
        }
      } catch (error) {
        secureLog.error('Error fetching employee ID', error);
      }
      
      if (userProfile._id) {
        setEmployeeId(userProfile._id);
      }
    };

    fetchEmployeeId();
  }, [userProfile, retryOperation]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!employeeId || !userProfile) return;

    const token = apiClient.getToken();
    if (token) {
      chatWebSocket.setToken(token);
    }

    const connectWebSocket = async () => {
      try {
        await chatWebSocket.connect();
        setWsConnected(true);
        secureLog.debug('WebSocket connected');
      } catch (error) {
        secureLog.error('Failed to connect WebSocket', error);
        setWsConnected(false);
      }
    };

    connectWebSocket();

    // Subscribe to WebSocket messages
    const unsubscribe = chatWebSocket.subscribe((message: ChatWebSocketMessage) => {
      handleWebSocketMessage(message);
    });

    return () => {
      unsubscribe();
      if (selectedRoom) {
        chatWebSocket.leaveRoom(selectedRoom._id);
      }
      chatWebSocket.disconnect();
    };
  }, [employeeId, userProfile]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: ChatWebSocketMessage) => {
    switch (message.type) {
      case 'new_message':
        if (message.message && message.room_id === selectedRoom?._id) {
          setMessages(prev => {
            const exists = prev.find(m => m._id === message.message._id);
            if (exists) return prev;
            return [...prev, message.message];
          });
          // Scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
        // Update unread counts
        if (message.room_id !== selectedRoom?._id) {
          setUnreadCounts(prev => ({
            ...prev,
            [message.room_id!]: (prev[message.room_id!] || 0) + 1
          }));
        }
        break;
      case 'message_updated':
        if (message.message) {
          setMessages(prev => prev.map(m => 
            m._id === message.message._id ? message.message : m
          ));
        }
        break;
      case 'message_deleted':
        if (message.message) {
          setMessages(prev => prev.filter(m => m._id !== message.message._id));
        }
        break;
      case 'typing':
        if (message.room_id && message.user_id) {
          setTypingUsers(prev => {
            const roomTyping = prev[message.room_id!] || [];
            if (message.is_typing) {
              return {
                ...prev,
                [message.room_id!]: [...roomTyping.filter(id => id !== message.user_id), message.user_id!]
              };
            } else {
              return {
                ...prev,
                [message.room_id!]: roomTyping.filter(id => id !== message.user_id)
              };
            }
          });
        }
        break;
      case 'error':
        toast({
          variant: 'destructive',
          title: 'WebSocket Error',
          description: message.error || 'An error occurred',
        });
        break;
    }
  }, [selectedRoom, toast]);

  // Join room when selected
  useEffect(() => {
    if (selectedRoom && wsConnected) {
      chatWebSocket.joinRoom(selectedRoom._id);
      return () => {
        chatWebSocket.leaveRoom(selectedRoom._id);
      };
    }
  }, [selectedRoom, wsConnected]);

  // Fetch available users with retry
  useEffect(() => {
    const fetchAvailableUsers = async () => {
      if (!userProfile?._id) return;
      
      try {
        setLoadingUsers(true);
        const response = await retryOperation(
          () => apiClient.getAvailableUsers(userProfile._id),
          'Fetch available users'
        );
        if (response?.success && response.data) {
          const usersData = Array.isArray(response.data) ? response.data : [];
          setAvailableUsers(usersData);
        }
      } catch (error) {
        secureLog.error('Error fetching available users', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchAvailableUsers();
  }, [userProfile, retryOperation]);

  // Fetch chat rooms with retry
  useEffect(() => {
    const fetchRooms = async () => {
      if (!userProfile?._id) return;
      
      try {
        setLoading(true);
        const departmentId = department?._id;
        const response = await retryOperation(
          () => apiClient.getChatRooms(userProfile._id, departmentId),
          'Fetch chat rooms'
        );
        if (response?.success && response.data) {
          const roomsData = Array.isArray(response.data) ? response.data : [];
          setRooms(roomsData);
          if (roomsData.length > 0 && !selectedRoom) {
            setSelectedRoom(roomsData[0]);
            setShowUserList(false);
          }
        }
      } catch (error) {
        secureLog.error('Error fetching chat rooms', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, [userProfile, department, retryOperation]);

  // Fetch messages for selected room with retry
  useEffect(() => {
    if (!selectedRoom || !employeeId) return;

    const fetchMessages = async () => {
      try {
        const response = await retryOperation(
          () => apiClient.getChatMessages(selectedRoom._id, 50),
          'Fetch messages'
        );
        if (response?.success && response.data) {
          const messagesData = Array.isArray(response.data) ? response.data : [];
          setMessages(messagesData);
          await apiClient.markRoomAsRead(selectedRoom._id, employeeId);
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      } catch (error) {
        secureLog.error('Error fetching messages', error);
      }
    };

    fetchMessages();
  }, [selectedRoom, employeeId, retryOperation]);

  // Fetch unread counts
  useEffect(() => {
    if (!employeeId) return;

    const fetchUnreadCounts = async () => {
      try {
        for (const room of rooms) {
          const response = await apiClient.getUnreadCount(employeeId, room._id);
          if (response.success) {
            setUnreadCounts(prev => ({
              ...prev,
              [room._id]: (response as any).count || 0
            }));
          }
        }
      } catch (error) {
        secureLog.error('Error fetching unread counts', error);
      }
    };

    if (rooms.length > 0) {
      fetchUnreadCounts();
      const interval = setInterval(fetchUnreadCounts, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [rooms, employeeId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Typing indicator
  const handleTyping = useCallback(() => {
    if (!selectedRoom || !employeeId) return;
    
    chatWebSocket.sendTyping(selectedRoom._id, true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      chatWebSocket.sendTyping(selectedRoom._id, false);
    }, 3000);
  }, [selectedRoom, employeeId]);

  // Search messages
  const handleSearch = useCallback(async () => {
    if (!selectedRoom || !searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const response = await retryOperation(
        () => apiClient.searchChatMessages(selectedRoom._id, searchQuery.trim()),
        'Search messages'
      );
      if (response?.success && response.data) {
        setSearchResults(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      secureLog.error('Error searching messages', error);
    } finally {
      setIsSearching(false);
    }
  }, [selectedRoom, searchQuery, retryOperation]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !employeeId || sending) return;

    try {
      setSending(true);
      chatWebSocket.sendTyping(selectedRoom._id, false);
      
      const response = await retryOperation(
        () => apiClient.sendChatMessage(selectedRoom._id, {
          sender_id: employeeId,
          message: newMessage.trim(),
          message_type: 'text'
        }),
        'Send message'
      );

      if (response?.success) {
        setNewMessage('');
        // Optimistic update - message will be added via WebSocket
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      secureLog.error('Error sending message', error);
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedRoom || !employeeId || uploading) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 10MB',
      });
      return;
    }

    try {
      setUploading(true);
      const response = await retryOperation(
        () => apiClient.uploadChatFile(selectedRoom._id, file, employeeId),
        'Upload file'
      );

      if (response?.success) {
        toast({
          title: 'Success',
          description: 'File uploaded successfully',
        });
      } else {
        throw new Error('Failed to upload file');
      }
    } catch (error) {
      secureLog.error('Error uploading file', error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInitiateChat = async (user: AvailableUser) => {
    if (!userProfile?._id || !employeeId) return;
    
    try {
      setLoading(true);
      const response = await retryOperation(
        () => apiClient.createDirectChatRoom(userProfile._id, user._id),
        'Create chat room'
      );
      
      if (response?.success && response.data) {
        const room = response.data as any;
        setRooms(prev => {
          const exists = prev.find(r => r._id === room._id);
          if (exists) return prev;
          return [room, ...prev];
        });
        setSelectedRoom(room);
        setShowUserList(false);
        setShowSidebar(false);
      }
    } catch (error) {
      secureLog.error('Error initiating chat', error);
    } finally {
      setLoading(false);
    }
  };

  const getOtherUserInRoom = (room: ChatRoom) => {
    if (!userProfile || room.room_type !== 'direct') return null;
    if (room.user_ids && room.user_ids.length > 0) {
      return room.user_ids.find((u: any) => u._id !== userProfile._id) || room.user_ids[0];
    }
    if (room.participants && room.participants.length > 0) {
      return room.participants[0];
    }
    return null;
  };

  const getRoomDisplayName = (room: ChatRoom) => {
    if (room.room_type === 'direct') {
      const otherUser = getOtherUserInRoom(room);
      if (otherUser) {
        return otherUser.full_name || otherUser.email || 'Unknown User';
      }
    }
    return room.name || 'Chat Room';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatMessageTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const formatMessageDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else {
        return format(date, 'MMMM d, yyyy');
      }
    } catch {
      return '';
    }
  };

  const isOwnMessage = useCallback((message: ChatMessage) => {
    return message.sender_id._id === employeeId || 
           message.sender_id._id === userProfile?._id ||
           (userProfile?.employee_id && message.sender_id._id === userProfile.employee_id) ||
           (message.sender_id.email === userProfile?.email);
  }, [employeeId, userProfile]);

  const displayedMessages = useMemo(() => {
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults;
    }
    return messages;
  }, [messages, searchResults, searchQuery]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { [key: string]: ChatMessage[] } = {};
    displayedMessages.forEach(message => {
      const date = formatMessageDate(message.createdAt);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    return groups;
  }, [displayedMessages]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 relative">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 left-4 z-50"
        onClick={() => setShowSidebar(!showSidebar)}
      >
        <ChevronLeft className={`h-4 w-4 transition-transform ${showSidebar ? '' : 'rotate-180'}`} />
      </Button>

      {/* Sidebar - Users List and Conversations */}
      <Card className={`w-80 flex-shrink-0 transition-transform md:translate-x-0 ${
        showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } absolute md:relative z-40 h-full md:h-auto`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {showUserList ? 'Available Users' : 'Conversations'}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUserList(!showUserList)}
            >
              {showUserList ? 'Conversations' : 'New Chat'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-12rem)]">
            {showUserList ? (
              <div className="space-y-1 p-2">
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableUsers.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-center">
                    <div>
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No users available</p>
                    </div>
                  </div>
                ) : (
                  availableUsers.map((user) => (
                    <Button
                      key={user._id}
                      variant="ghost"
                      className="w-full justify-start text-left h-auto py-3 px-3"
                      onClick={() => handleInitiateChat(user)}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarFallback>
                            {getInitials(user.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <span className="font-medium truncate">{user.full_name}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </span>
                          {user.department && (
                            <Badge variant="outline" className="text-xs w-fit">
                              {user.department.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-center">
                    <div>
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No conversations yet</p>
                      <p className="text-xs mt-1">Start a new chat to begin</p>
                    </div>
                  </div>
                ) : (
                  rooms.map((room) => {
                    const otherUser = getOtherUserInRoom(room);
                    const displayName = getRoomDisplayName(room);
                    
                    return (
                      <Button
                        key={room._id}
                        variant={selectedRoom?._id === room._id ? 'secondary' : 'ghost'}
                        className="w-full justify-start text-left h-auto py-3 px-3"
                        onClick={() => {
                          setSelectedRoom(room);
                          setShowUserList(false);
                          setShowSidebar(false);
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {room.room_type === 'direct' && otherUser ? (
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                <AvatarFallback>
                                  {getInitials(otherUser.full_name || otherUser.email || 'U')}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <Hash className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              <span className="font-medium truncate">{displayName}</span>
                              {room.room_type === 'department' && room.description && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {room.description}
                                </span>
                              )}
                            </div>
                          </div>
                          {unreadCounts[room._id] > 0 && (
                            <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                              {unreadCounts[room._id] > 99 ? '99+' : unreadCounts[room._id]}
                            </Badge>
                          )}
                        </div>
                      </Button>
                    );
                  })
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Chat Messages Area */}
      <Card className="flex-1 flex flex-col min-w-0">
        {selectedRoom ? (
          <>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {selectedRoom.room_type === 'direct' ? (
                    <>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {getInitials(getRoomDisplayName(selectedRoom))}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{getRoomDisplayName(selectedRoom)}</span>
                    </>
                  ) : (
                    <>
                      <Hash className="w-5 h-5" />
                      <span className="truncate">{selectedRoom.name}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!wsConnected && (
                    <Badge variant="outline" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Reconnecting...
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="md:hidden"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {selectedRoom.room_type === 'department' && selectedRoom.description && (
                <CardDescription className="mt-1">
                  {selectedRoom.description}
                </CardDescription>
              )}
            </CardHeader>

            {/* Search Bar */}
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {isSearching && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Searching...
                </div>
              )}
              {searchQuery && searchResults.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              {/* Messages List */}
              <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
                <div className="space-y-4 py-4">
                  {Object.entries(groupedMessages).map(([date, dateMessages]) => (
                    <div key={date}>
                      <div className="flex items-center justify-center my-4">
                        <Badge variant="outline" className="text-xs">
                          {date}
                        </Badge>
                      </div>
                      {dateMessages.map((message) => {
                        const isOwn = isOwnMessage(message);
                        return (
                          <div
                            key={message._id}
                            className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
                          >
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback>
                                {getInitials(message.sender_id.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`flex flex-col gap-1 flex-1 min-w-0 ${isOwn ? 'items-end' : 'items-start'}`}>
                              <div className={`flex items-center gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                                <span className="font-semibold text-sm">
                                  {message.sender_id.full_name}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {message.sender_department_id.name}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatMessageTime(message.createdAt)}
                                </span>
                              </div>
                              {message.reply_to && (
                                <div className={`text-xs text-muted-foreground p-2 bg-muted rounded ${isOwn ? 'ml-auto' : 'mr-auto'} max-w-xs`}>
                                  Replying to {message.reply_to.sender_id.full_name}: {message.reply_to.message}
                                </div>
                              )}
                              <div
                                className={`rounded-lg px-4 py-2 max-w-md ${
                                  isOwn
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }`}
                              >
                                {message.message_type === 'image' && message.file_url ? (
                                  <div className="space-y-2">
                                    <img
                                      src={message.file_url}
                                      alt={message.file_name || 'Image'}
                                      className="max-w-full h-auto rounded"
                                      loading="lazy"
                                    />
                                    {message.message && (
                                      <p className="text-sm whitespace-pre-wrap break-words">
                                        {message.message}
                                      </p>
                                    )}
                                  </div>
                                ) : message.message_type === 'file' && message.file_url ? (
                                  <div className="space-y-2">
                                    <a
                                      href={message.file_url}
                                      download={message.file_name}
                                      className="flex items-center gap-2 text-sm hover:underline"
                                    >
                                      <FileIcon className="w-4 h-4" />
                                      <span>{message.file_name || 'Download file'}</span>
                                      <Download className="w-3 h-3" />
                                    </a>
                                    {message.file_size && (
                                      <span className="text-xs opacity-75">
                                        {(message.file_size / 1024).toFixed(2)} KB
                                      </span>
                                    )}
                                    {message.message && (
                                      <p className="text-sm whitespace-pre-wrap break-words">
                                        {message.message}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm whitespace-pre-wrap break-words">
                                    {message.message}
                                  </p>
                                )}
                              </div>
                              {isOwn && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  {message.is_read ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Read</span>
                                    </>
                                  ) : (
                                    <span>Sent</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {typingUsers[selectedRoom._id] && typingUsers[selectedRoom._id].length > 0 && (
                    <div className="flex gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback>
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="bg-muted rounded-lg px-4 py-2">
                        <p className="text-sm text-muted-foreground italic">
                          {typingUsers[selectedRoom._id].length === 1 ? 'Someone is typing...' : 'Multiple people are typing...'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="border-t p-4 space-y-2">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setError(null)}
                      className="ml-auto h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file);
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
                    title="Attach file"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </Button>
                  <Textarea
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                    }}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message... (Shift+Enter for new line)"
                    disabled={sending || uploading}
                    className="flex-1 min-h-[60px] max-h-[200px] resize-none"
                    rows={1}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending || uploading}
                    size="icon"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              {showUserList ? (
                <>
                  <Users className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-lg font-semibold mb-2">Start a Conversation</p>
                  <p className="text-sm">Select a user from the list to start chatting</p>
                </>
              ) : (
                <>
                  <MessageSquare className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-lg font-semibold mb-2">No Conversation Selected</p>
                  <p className="text-sm">Select a conversation or start a new chat</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowUserList(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Start New Chat
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

