// ============================================
// MESSAGING SYSTEM - FIXED VERSION
// ============================================
// File: js/messaging.js
// Requires: supabase-client.js

console.log('📨 Loading messaging.js...');

// Verify SupabaseClient is loaded
if (!window.SupabaseClient) {
    console.error('❌ CRITICAL: SupabaseClient not loaded!');
    console.error('Make sure supabase-client.js is loaded BEFORE messaging.js');
} else {
    console.log('✅ SupabaseClient found');
}

// ============================================
// CONVERSATIONS
// ============================================

/**
 * Get or create conversation between two users (client and lawyer)
 */
async function getOrCreateConversation(userId1, userId2) {
    try {
        console.log('🔍 Getting/Creating conversation between:', userId1, 'and', userId2);
        
        const supabase = window.SupabaseClient.supabase;
        
        // First, determine who is the client and who is the lawyer
        const { data: user1Profile } = await supabase
            .from('users')
            .select('user_type')
            .eq('id', userId1)
            .single();
            
        const { data: user2Profile } = await supabase
            .from('users')
            .select('user_type')
            .eq('id', userId2)
            .single();
        
        console.log('User 1 type:', user1Profile?.user_type);
        console.log('User 2 type:', user2Profile?.user_type);
        
        // Determine client and lawyer IDs
        let clientId, lawyerId;
        if (user1Profile?.user_type === 'client') {
            clientId = userId1;
            lawyerId = userId2;
        } else if (user1Profile?.user_type === 'lawyer') {
            lawyerId = userId1;
            clientId = userId2;
        } else {
            // Fallback: assume first user is client, second is lawyer
            clientId = userId1;
            lawyerId = userId2;
        }
        
        console.log('Client ID:', clientId, 'Lawyer ID:', lawyerId);

        // Try to find existing conversation (check both directions)
        const { data: existing, error: findError } = await supabase
            .from('conversations')
            .select('*')
            .eq('client_id', clientId)
            .eq('lawyer_id', lawyerId)
            .maybeSingle();

        if (existing) {
            console.log('✅ Found existing conversation:', existing.id);
            return { success: true, data: existing };
        }

        console.log('📝 Creating new conversation...');
        
        // Create new conversation if not found
        const { data: newConv, error: createError } = await supabase
            .from('conversations')
            .insert({
                client_id: clientId,
                lawyer_id: lawyerId,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (createError) {
            console.error('❌ Error creating conversation:', createError);
            throw createError;
        }

        console.log('✅ Created new conversation:', newConv.id);
        return { success: true, data: newConv };

    } catch (error) {
        console.error('❌ Error getting/creating conversation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all conversations for a user
 */
async function getUserConversations(userId) {
    try {
        console.log('🔍 Loading conversations for user:', userId);
        
        const supabase = window.SupabaseClient.supabase;
        
        // First get conversations
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .or(`client_id.eq.${userId},lawyer_id.eq.${userId}`)
            .order('last_message_at', { ascending: false, nullsFirst: false });

        if (convError) {
            console.error('❌ Error fetching conversations:', convError);
            throw convError;
        }

        console.log('📊 Found conversations:', conversations?.length || 0);

        // For each conversation, get the user details
        const conversationsWithDetails = await Promise.all(
            (conversations || []).map(async (conv) => {
                // Get client details
                const { data: client } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, profile_photo_url')
                    .eq('id', conv.client_id)
                    .single();

                // Get lawyer details
                const { data: lawyer } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, profile_photo_url')
                    .eq('id', conv.lawyer_id)
                    .single();

                // Get last message
                const { data: lastMsg } = await supabase
                    .from('messages')
                    .select('message_text, created_at, sender_id')
                    .eq('conversation_id', conv.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                // Get unread count
                const { count } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', conv.id)
                    .eq('is_read', false)
                    .neq('sender_id', userId);

                return {
                    ...conv,
                    client,
                    lawyer,
                    lastMessage: lastMsg,
                    unreadCount: count || 0
                };
            })
        );

        console.log('✅ Loaded conversations with details');
        return { success: true, data: conversationsWithDetails };

    } catch (error) {
        console.error('❌ Error fetching conversations:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// ============================================
// MESSAGES
// ============================================

/**
 * Send a message
 */
async function sendMessage(conversationId, senderId, messageText, attachmentFile = null) {
    try {
        console.log('📤 Sending message to conversation:', conversationId);
        
        const supabase = window.SupabaseClient.supabase;
        let attachmentUrl = null;
        let attachmentName = null;
        let attachmentType = null;

        // Upload attachment if provided
        if (attachmentFile) {
            const uploadFile = window.SupabaseClient.uploadFile;
            const STORAGE_BUCKETS = window.SupabaseClient.STORAGE_BUCKETS;
            
            const fileName = `${senderId}/${Date.now()}_${attachmentFile.name}`;
            attachmentUrl = await uploadFile(STORAGE_BUCKETS.CHAT_ATTACHMENTS, attachmentFile, fileName);
            
            if (!attachmentUrl) throw new Error('Failed to upload attachment');
            
            attachmentName = attachmentFile.name;
            attachmentType = attachmentFile.type;
        }

        // Insert message
        const { data, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_id: senderId,
                message_text: messageText,
                attachment_url: attachmentUrl,
                attachment_name: attachmentName,
                attachment_type: attachmentType,
                created_at: new Date().toISOString(),
                is_read: false
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Error sending message:', error);
            throw error;
        }

        // Update conversation's last_message_at
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);

        console.log('✅ Message sent successfully');
        return { success: true, data };

    } catch (error) {
        console.error('❌ Error sending message:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get messages for a conversation
 */
async function getMessages(conversationId, limit = 50) {
    try {
        console.log('📥 Loading messages for conversation:', conversationId);
        
        const supabase = window.SupabaseClient.supabase;
        
        // Get messages
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            console.error('❌ Error fetching messages:', error);
            throw error;
        }

        // Get sender info for each message
        const messagesWithSender = await Promise.all(
            (messages || []).map(async (msg) => {
                const { data: sender } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, profile_photo_url')
                    .eq('id', msg.sender_id)
                    .single();

                return {
                    ...msg,
                    sender
                };
            })
        );

        console.log('✅ Loaded', messagesWithSender?.length || 0, 'messages');
        return { success: true, data: messagesWithSender || [] };

    } catch (error) {
        console.error('❌ Error fetching messages:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Mark messages as read
 */
async function markMessagesAsRead(conversationId, userId) {
    try {
        const supabase = window.SupabaseClient.supabase;
        
        const { error } = await supabase
            .from('messages')
            .update({ 
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error marking messages as read:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a message
 */
async function deleteMessage(messageId) {
    try {
        const supabase = window.SupabaseClient.supabase;
        
        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error deleting message:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// REAL-TIME MESSAGING
// ============================================

/**
 * Subscribe to new messages in a conversation
 */
function subscribeToConversationMessages(conversationId, callback) {
    const subscribeToMessages = window.SupabaseClient.subscribeToMessages;
    return subscribeToMessages(conversationId, (payload) => {
        if (payload.eventType === 'INSERT') {
            callback(payload.new);
        }
    });
}

/**
 * Unsubscribe from messages
 */
function unsubscribeFromMessages(subscription) {
    const unsubscribe = window.SupabaseClient.unsubscribe;
    unsubscribe(subscription);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format message time
 */
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get conversation partner info
 */
function getConversationPartner(conversation, currentUserId) {
    if (conversation.client_id === currentUserId) {
        return {
            id: conversation.lawyer_id,
            ...conversation.lawyer
        };
    } else {
        return {
            id: conversation.client_id,
            ...conversation.client
        };
    }
}

/**
 * Check if message is from current user
 */
function isOwnMessage(message, currentUserId) {
    return message.sender_id === currentUserId;
}

// Export everything
window.Messaging = {
    getOrCreateConversation,
    getUserConversations,
    sendMessage,
    getMessages,
    markMessagesAsRead,
    deleteMessage,
    subscribeToConversationMessages,
    unsubscribeFromMessages,
    formatMessageTime,
    getConversationPartner,
    isOwnMessage
};

console.log('✅ Messaging system initialized successfully');
console.log('✅ window.Messaging is now available');