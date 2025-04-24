import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Image,
  Dimensions
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import io, { Socket } from 'socket.io-client';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { 
  FadeInRight, 
  FadeInLeft, 
  FadeIn
} from 'react-native-reanimated';

// Define types
type Message = {
  id: string;
  text: string;
  senderId: string;
  senderType: string;
  timestamp: Date;
  isRead: boolean;
};

const PatientChat: React.FC = () => {
  const router = useRouter();
  
  // State
  const [message, setMessage] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [inputHeight, setInputHeight] = useState(40);
  
  // Refs
  const socket = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList | null>(null);
  
  // Generate a random user ID for anonymous patient
  const patientId = useRef<string>(`user_${Math.random().toString(36).substring(2, 9)}`);
  // Fixed doctor ID
  const doctorId = useRef<string>('main_doctor');
  const chatId = useRef<string>(`${patientId.current}-${doctorId.current}`);
  
  // Setup socket connection
  useEffect(() => {
    // Add haptic feedback when component mounts
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // Connect to your socket server
    socket.current = io('http://localhost:3000', {
      transports: ['websocket'],
      query: {
        userId: patientId.current,
        userType: 'patient',
      }
    });

    // Handle connection
    socket.current.on('connect', () => {
      console.log('Connected to chat server');
      setIsConnecting(false);
      
      // Join chat with doctor
      joinDoctorChat();
      
      // Add welcome message
      setMessages([
        {
          id: 'system-welcome',
          text: 'Connected to healthcare chat. Start a conversation with a doctor.',
          senderId: 'system',
          senderType: 'system',
          timestamp: new Date(),
          isRead: true,
        }
      ]);
    });

    // Handle connection error
    socket.current.on('connect_error', (error) => {
      console.log('Connection error:', error);
      setMessages([
        {
          id: 'system-error',
          text: 'Failed to connect to the chat server. Please try again later.',
          senderId: 'system',
          senderType: 'system',
          timestamp: new Date(),
          isRead: true,
        }
      ]);
      setIsConnecting(false);
    });

    // Handle previous messages
    socket.current.on('previousMessages', ({ chatId, messages: messageHistory }: { chatId: string; messages: Message[] }) => {
      if (messageHistory && messageHistory.length > 0) {
        setMessages(prevMessages => [
          ...prevMessages,
          ...messageHistory.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        ]);
        setIsConnected(true);
        
        // Add haptic feedback when messages arrive
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    });

    // Handle incoming messages
    socket.current.on('message', ({ chatId, message: data }) => {
      // Convert timestamp to Date
      const newMessage = {
        ...data,
        timestamp: new Date(data.timestamp),
      };
      
      // Add message to chat
      setMessages(prevMessages => [...prevMessages, newMessage]);
      setIsTyping(false);
      setIsConnected(true);
      
      // Add haptic feedback when message arrives
      if (data.senderId !== patientId.current && Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Mark message as read
      if (data.senderId !== patientId.current) {
        socket.current?.emit('markAsRead', {
          chatId: chatId.current,
          messageIds: [data.id],
        });
      }
    });

    // Handle typing indicator
    socket.current.on('typing', ({ chatId, userId, isTyping: typing }) => {
      if (userId !== patientId.current) {
        setIsTyping(typing);
      }
    });

    // Clean up on unmount
    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, []);

  // Function to handle input height changes
  const updateInputHeight = (height: number) => {
    const newHeight = Math.min(Math.max(40, height), 100);
    setInputHeight(newHeight);
  };

  // Join chat with a doctor
  const joinDoctorChat = () => {
    socket.current?.emit('joinChat', {
      patientId: patientId.current,
      doctorId: doctorId.current,
    });
  };

  // Send a message
  const sendMessage = () => {
    if (!message.trim()) return;
    
    // Add haptic feedback on send
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // Send to server
    socket.current?.emit('message', {
      text: message,
      chatId: chatId.current,
      timestamp: new Date(),
    });
    
    // Clear input
    setMessage('');
    setInputHeight(40);
  };

  // Handle typing
  const handleTyping = (text: string) => {
    setMessage(text);
    
    // Send typing status to server
    socket.current?.emit('typing', {
      chatId: chatId.current,
      isTyping: text.length > 0,
    });
  };

  // Typing indicator component
  const TypingIndicator = () => {
    const [dots, setDots] = useState(1);
    
    useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => (prev % 3) + 1);
      }, 500);
      return () => clearInterval(interval);
    }, []);
    
    return (
      <Animated.View 
        entering={FadeIn.duration(200)}
        style={{ padding: 12 }}
      >
        <View style={{ 
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#f3f4f6',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 16,
          alignSelf: 'flex-start',
          maxWidth: '60%'
        }}>
          <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 8 }} />
          <Text style={{ fontSize: 14, color: '#6b7280' }}>
            Doctor is typing{'.'.repeat(dots)}
          </Text>
        </View>
      </Animated.View>
    );
  };

  // User Message Component
  const UserMessage = ({ message }: { message: Message }) => (
    <Animated.View 
      entering={FadeInRight.duration(300)}
      style={{ alignSelf: 'flex-end', maxWidth: '75%', marginVertical: 4, marginHorizontal: 12 }}
    >
      <View style={{ 
        backgroundColor: '#FF7B00', 
        borderRadius: 18, 
        borderBottomRightRadius: 4,
        padding: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2,
      }}>
        <Text style={{ color: 'white', fontSize: 16 }}>
          {message.text}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginRight: 4 }}>
            {message.timestamp instanceof Date 
              ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {message.isRead && <FontAwesome5 name="check" size={10} color="rgba(255, 255, 255, 0.7)" />}
        </View>
      </View>
    </Animated.View>
  );

  // Doctor Message Component
  const DoctorMessage = ({ message }: { message: Message }) => (
    <Animated.View 
      entering={FadeInLeft.duration(300)}
      style={{ alignSelf: 'flex-start', maxWidth: '75%', marginVertical: 4, marginHorizontal: 12, flexDirection: 'row' }}
    >
      <View style={{ 
        width: 36, 
        height: 36, 
        borderRadius: 18, 
        backgroundColor: '#e5e7eb', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginRight: 8,
        alignSelf: 'flex-end'
      }}>
        <FontAwesome5 name="user-md" size={18} color="#3b82f6" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ 
          backgroundColor: '#f3f4f6', 
          borderRadius: 18, 
          borderBottomLeftRadius: 4,
          padding: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 1,
        }}>
          <Text style={{ color: '#1F2937', fontSize: 16 }}>
            {message.text}
          </Text>
          <Text style={{ fontSize: 12, color: '#6b7280', alignSelf: 'flex-start', marginTop: 4 }}>
            {message.timestamp instanceof Date 
              ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    </Animated.View>
  );

  // System Message Component
  const SystemMessage = ({ message }: { message: Message }) => (
    <Animated.View 
      entering={FadeIn.duration(300)}
      style={{ alignItems: 'center', margin: 12 }}
    >
      <View style={{
        backgroundColor: 'rgba(243, 244, 246, 0.7)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
      }}>
        <Text style={{ color: '#6b7280', fontSize: 14, fontStyle: 'italic', textAlign: 'center' }}>
          {message.text}
        </Text>
      </View>
    </Animated.View>
  );

  // Render message based on sender
  const renderMessage = ({ item }: { item: Message }) => {
    if (item.senderId === 'system') {
      return <SystemMessage message={item} />;
    } else if (item.senderId === patientId.current) {
      return <UserMessage message={item} />;
    } else {
      return <DoctorMessage message={item} />;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      
      {isConnecting ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#FF7B00" />
          <Text style={{ marginTop: 16, color: '#4B5563', fontSize: 16 }}>Connecting to doctor...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Chat header */}
          <View style={{ 
            padding: 16, 
            backgroundColor: '#fff', 
            borderBottomWidth: 1, 
            borderBottomColor: '#e5e7eb',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <TouchableOpacity 
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.back();
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#4B5563" />
            </TouchableOpacity>
            
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, color: '#1F2937' }}>Professional Chat</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: 4, 
                  backgroundColor: isConnected ? '#10B981' : '#F59E0B',
                  marginRight: 6
                }} />
                <Text style={{ color: '#6b7280', fontSize: 14 }}>
                  {isConnected ? 'Doctor is online' : 'Connecting to doctor...'}
                </Text>
              </View>
            </View>
            
            <View style={{ width: 40 }} />
          </View>
          
          {/* Messages list */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            style={{ flex: 1 }}
          />
          
          {/* Typing indicator */}
          {isTyping && <TypingIndicator />}
          
          {/* Message input */}
          <View style={{ 
            flexDirection: 'row', 
            padding: 12, 
            borderTopWidth: 1, 
            borderTopColor: '#e5e7eb', 
            backgroundColor: '#fff',
            alignItems: 'flex-end'
          }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: '#F9FAFB',
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                minHeight: inputHeight,
                maxHeight: 100,
              }}
              value={message}
              onChangeText={handleTyping}
              placeholder="Type a message..."
              multiline
              onContentSizeChange={(e) => 
                updateInputHeight(e.nativeEvent.contentSize.height)
              }
            />
            <TouchableOpacity
              style={{
                marginLeft: 8,
                backgroundColor: message.trim() ? '#FF7B00' : '#FECACA',
                borderRadius: 24,
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <Ionicons name="send" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

export default PatientChat;