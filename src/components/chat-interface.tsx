'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageSquare, Send, Users, Hash, Clock, CheckCircle2, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

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
  const [unreadCounts, setUnreadCounts] = useState<{ [roomId: string]: number }>({});
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showUserList, setShowUserList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch employee ID from user profile
  useEffect(() => {
    const fetchEmployeeId = async () => {
      if (!userProfile) return;
      
      // Use employee_id from userProfile if available
      if (userProfile.employee_id) {
        setEmployeeId(userProfile.employee_id);
        return;
      }
      
      // Try to get employee by email
      try {
        const employeesResponse = await apiClient.getEmployees();
        if (employeesResponse.success && employeesResponse.data) {
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
        console.error('Error fetching employee ID:', error);
      }
      
      // Fallback: use user ID if employee not found
      // Backend will handle user_id -> employee_id mapping
      if (userProfile._id) {
        setEmployeeId(userProfile._id);
      }
    };

    fetchEmployeeId();
  }, [userProfile]);

  // Fetch available users
  useEffect(() => {
    const fetchAvailableUsers = async () => {
      if (!userProfile?._id) return;
      
      try {
        setLoadingUsers(true);
        const response = await apiClient.getAvailableUsers(userProfile._id);
        if (response.success && response.data) {
          const usersData = Array.isArray(response.data) ? response.data : [];
          setAvailableUsers(usersData);
        }
      } catch (error) {
        console.error('Error fetching available users:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load available users',
        });
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchAvailableUsers();
  }, [userProfile, toast]);

  // Fetch chat rooms (existing conversations)
  useEffect(() => {
    const fetchRooms = async () => {
      if (!userProfile?._id) return;
      
      try {
        setLoading(true);
        const departmentId = department?._id;
        const response = await apiClient.getChatRooms(userProfile._id, departmentId);
        if (response.success && response.data) {
          const roomsData = Array.isArray(response.data) ? response.data : [];
          setRooms(roomsData);
          // Auto-select first room if available and no room is selected
          if (roomsData.length > 0 && !selectedRoom) {
            setSelectedRoom(roomsData[0]);
            setShowUserList(false);
          }
        }
      } catch (error) {
        console.error('Error fetching chat rooms:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load chat rooms',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, [userProfile, department, toast]);

  // Fetch messages for selected room
  useEffect(() => {
    if (!selectedRoom || !employeeId) return;

    const fetchMessages = async () => {
      try {
        const response = await apiClient.getChatMessages(selectedRoom._id, 50);
        if (response.success && response.data) {
          const messagesData = Array.isArray(response.data) ? response.data : [];
          setMessages(messagesData);
          // Mark room as read
          await apiClient.markRoomAsRead(selectedRoom._id, employeeId);
          // Scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load messages',
        });
      }
    };

    fetchMessages();

    // Poll for new messages every 3 seconds
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await apiClient.getChatMessages(selectedRoom._id, 50);
        if (response.success && response.data) {
          const messagesData = Array.isArray(response.data) ? response.data : [];
          setMessages(messagesData);
        }
      } catch (error) {
        console.error('Error polling messages:', error);
      }
    }, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [selectedRoom, employeeId]);

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
        console.error('Error fetching unread counts:', error);
      }
    };

    if (rooms.length > 0) {
      fetchUnreadCounts();
      // Poll for unread counts every 10 seconds
      const interval = setInterval(fetchUnreadCounts, 10000);
      return () => clearInterval(interval);
    }
  }, [rooms, employeeId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !employeeId || sending) return;

    try {
      setSending(true);
      const response = await apiClient.sendChatMessage(selectedRoom._id, {
        sender_id: employeeId,
        message: newMessage.trim(),
        message_type: 'text'
      });

      if (response.success && response.data) {
        setNewMessage('');
        // Refresh messages to get the latest
        const messagesResponse = await apiClient.getChatMessages(selectedRoom._id, 50);
        if (messagesResponse.success && messagesResponse.data) {
          const messagesData = Array.isArray(messagesResponse.data) ? messagesResponse.data : [];
          setMessages(messagesData);
        } else {
          // Fallback: add new message to array
          setMessages(prev => [...prev, (response as any).data]);
        }
        // Refresh rooms list to update last activity
        if (userProfile?._id) {
          const departmentId = department?._id;
          const roomsResponse = await apiClient.getChatRooms(userProfile._id, departmentId);
          if (roomsResponse.success && roomsResponse.data) {
            const roomsData = Array.isArray(roomsResponse.data) ? roomsResponse.data : [];
            setRooms(roomsData);
          }
        }
        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to send message',
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message',
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInitiateChat = async (user: AvailableUser) => {
    if (!userProfile?._id || !employeeId) return;
    
    try {
      setLoading(true);
      // Create or get direct chat room
      const response = await apiClient.createDirectChatRoom(userProfile._id, user._id);
      
      if (response.success && response.data) {
        const room = response.data as any;
        
        // Add room to rooms list if not already there
        setRooms(prev => {
          const exists = prev.find(r => r._id === room._id);
          if (exists) return prev;
          return [room, ...prev];
        });
        
        // Select the room and fetch messages
        setSelectedRoom(room);
        setShowUserList(false);
        // Refresh rooms list to include the new room
        if (userProfile?._id) {
          const departmentId = department?._id;
          const roomsResponse = await apiClient.getChatRooms(userProfile._id, departmentId);
          if (roomsResponse.success && roomsResponse.data) {
            const roomsData = Array.isArray(roomsResponse.data) ? roomsResponse.data : [];
            setRooms(roomsData);
            // Update selected room from the refreshed list
            const updatedRoom = roomsData.find((r: ChatRoom) => r._id === room._id);
            if (updatedRoom) {
              setSelectedRoom(updatedRoom);
            }
          }
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to start chat',
        });
      }
    } catch (error) {
      console.error('Error initiating chat:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to start chat',
      });
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
      // For participants, we'd need to check employee_id mapping
      // For now, return the first participant that's not the current user
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar - Users List and Conversations */}
      <Card className="w-80 flex-shrink-0">
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
              /* Available Users List */
              <div className="space-y-1 p-2">
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    Loading users...
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
              /* Conversations List */
              <div className="space-y-1 p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    Loading conversations...
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
                              {room.room_type === 'department' && room.department_ids && room.department_ids.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {room.department_ids.slice(0, 2).map((dept) => (
                                    <Badge key={dept._id} variant="outline" className="text-xs">
                                      {dept.name}
                                    </Badge>
                                  ))}
                                  {room.department_ids.length > 2 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{room.department_ids.length - 2}
                                    </Badge>
                                  )}
                                </div>
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
      <Card className="flex-1 flex flex-col">
        {selectedRoom ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {selectedRoom.room_type === 'direct' ? (
                  <>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {getInitials(getRoomDisplayName(selectedRoom))}
                      </AvatarFallback>
                    </Avatar>
                    <span>{getRoomDisplayName(selectedRoom)}</span>
                  </>
                ) : (
                  <>
                    <Hash className="w-5 h-5" />
                    <span>{selectedRoom.name}</span>
                  </>
                )}
              </CardTitle>
              {selectedRoom.room_type === 'department' && (
                <>
                  <CardDescription>
                    {selectedRoom.description || 'Inter-department communication'}
                  </CardDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedRoom.department_ids?.map((dept) => (
                      <Badge key={dept._id} variant="outline">
                        {dept.name}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
              {selectedRoom.room_type === 'direct' && (
                <CardDescription>
                  Direct message conversation
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages List */}
              <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
                <div className="space-y-4 py-4">
                  {messages.map((message) => {
                    // Check if message is from current user (by employee_id or user_id)
                    const isOwnMessage = message.sender_id._id === employeeId || 
                                      message.sender_id._id === userProfile?._id ||
                                      (userProfile?.employee_id && message.sender_id._id === userProfile.employee_id) ||
                                      (message.sender_id.email === userProfile?.email);
                    return (
                      <div
                        key={message._id}
                        className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback>
                            {getInitials(message.sender_id.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex flex-col gap-1 flex-1 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                          <div className={`flex items-center gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
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
                            <div className={`text-xs text-muted-foreground p-2 bg-muted rounded ${isOwnMessage ? 'ml-auto' : 'mr-auto'} max-w-xs`}>
                              Replying to {message.reply_to.sender_id.full_name}: {message.reply_to.message}
                            </div>
                          )}
                          <div
                            className={`rounded-lg px-4 py-2 max-w-md ${
                              isOwnMessage
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {message.message}
                            </p>
                          </div>
                          {isOwnMessage && (
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
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending}
                    size="icon"
                  >
                    <Send className="w-4 h-4" />
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

