// ============================================
// SUPABASE CLIENT CONFIGURATION - IMPROVED
// ============================================
// File: js/supabase-client.js

var SUPABASE_URL = 'https://iysgxcwspllzfdpjrcms.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5c2d4Y3dzcGxsemZkcGpyY21zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxOTQ3NTksImV4cCI6MjA3ODc3MDc1OX0.40cdJ92_UV4h09NW_N_kIuKi1xogNpDI11Dqz-ey0A8';

// Wait for Supabase library to load
if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded yet!');
}

// Create Supabase client
var supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STORAGE BUCKET NAMES
// ============================================
var STORAGE_BUCKETS = {
    PROFILE_PHOTOS: 'profile-photos',
    DOCUMENTS: 'documents',
    CHAT_ATTACHMENTS: 'chat-attachments'
};

// ============================================
// TIMEOUT WRAPPER FOR ASYNC OPERATIONS
// ============================================

/**
 * Wrap async function with timeout
 */
async function withTimeout(promise, timeoutMs = 15000, errorMessage = 'Operation timed out') {
    let timeoutId;
    
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(errorMessage));
        }, timeoutMs);
    });
    
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user is authenticated (with timeout)
 */
async function isAuthenticated() {
    try {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return false;
        }
        
        const { data: { session }, error } = await withTimeout(
            supabase.auth.getSession(),
            10000,
            'Authentication check timed out'
        );
        
        if (error) {
            console.error('Auth check error:', error);
            return false;
        }
        
        return session !== null;
    } catch (error) {
        console.error('isAuthenticated error:', error);
        return false;
    }
}

/**
 * Get current user (with timeout)
 */
async function getCurrentUser() {
    try {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return null;
        }
        
        const { data: { user }, error } = await withTimeout(
            supabase.auth.getUser(),
            10000,
            'Get user timed out'
        );
        
        if (error) {
            console.error('Get user error:', error);
            return null;
        }
        
        return user;
    } catch (error) {
        console.error('getCurrentUser error:', error);
        return null;
    }
}

/**
 * Get user profile data (with timeout)
 */
async function getUserProfile(userId) {
    try {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return null;
        }
        
        const { data, error } = await withTimeout(
            supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single(),
            10000,
            'Profile fetch timed out'
        );
        
        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('getUserProfile error:', error);
        return null;
    }
}

/**
 * Get lawyer profile data (with timeout)
 */
async function getLawyerProfile(lawyerId) {
    try {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return null;
        }
        
        const { data, error } = await withTimeout(
            supabase
                .from('lawyers')
                .select(`
                    *,
                    users!inner(*)
                `)
                .eq('id', lawyerId)
                .single(),
            10000,
            'Lawyer profile fetch timed out'
        );
        
        if (error) {
            console.error('Error fetching lawyer profile:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('getLawyerProfile error:', error);
        return null;
    }
}

/**
 * Upload file to Supabase Storage (with timeout)
 */
async function uploadFile(bucket, file, path) {
    try {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return null;
        }
        
        const { data, error } = await withTimeout(
            supabase.storage
                .from(bucket)
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: true
                }),
            30000, // 30 seconds for file upload
            'File upload timed out'
        );
        
        if (error) {
            console.error('Error uploading file:', error);
            return null;
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);
        
        return publicUrl;
    } catch (error) {
        console.error('uploadFile error:', error);
        return null;
    }
}

/**
 * Delete file from Supabase Storage (with timeout)
 */
async function deleteFile(bucket, path) {
    try {
        if (!supabase) {
            console.error('Supabase client not initialized');
            return false;
        }
        
        const { error } = await withTimeout(
            supabase.storage
                .from(bucket)
                .remove([path]),
            10000,
            'File deletion timed out'
        );
        
        if (error) {
            console.error('Error deleting file:', error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('deleteFile error:', error);
        return false;
    }
}

/**
 * Get public URL for a file
 */
function getPublicUrl(bucket, path) {
    if (!supabase) {
        console.error('Supabase client not initialized');
        return null;
    }
    
    const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);
    
    return data.publicUrl;
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

/**
 * Format time for display
 */
function formatTime(dateString) {
    const options = { hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleTimeString('en-US', options);
}

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'PKR') {
    return `${currency} ${amount.toLocaleString()}`;
}

/**
 * Show loading spinner
 */
function showLoading(element) {
    if (element) {
        element.innerHTML = '<div class="loading-spinner">Loading...</div>';
    }
}

/**
 * Hide loading spinner
 */
function hideLoading(element) {
    if (element) {
        const spinner = element.querySelector('.loading-spinner');
        if (spinner) spinner.remove();
    }
}

/**
 * Show error message
 */
function showError(message) {
    alert(`Error: ${message}`);
}

/**
 * Show success message
 */
function showSuccess(message) {
    alert(`Success: ${message}`);
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Generate unique filename
 */
function generateUniqueFilename(originalFilename) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = originalFilename.split('.').pop();
    return `${timestamp}_${random}.${extension}`;
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to messages in a conversation
 */
function subscribeToMessages(conversationId, callback) {
    if (!supabase) {
        console.error('Supabase client not initialized');
        return null;
    }
    
    return supabase
        .channel(`messages:${conversationId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            },
            callback
        )
        .subscribe();
}

/**
 * Subscribe to conversation updates
 */
function subscribeToConversations(userId, callback) {
    if (!supabase) {
        console.error('Supabase client not initialized');
        return null;
    }
    
    return supabase
        .channel(`conversations:${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'conversations'
            },
            callback
        )
        .subscribe();
}

/**
 * Unsubscribe from real-time channel
 */
function unsubscribe(subscription) {
    if (subscription && supabase) {
        supabase.removeChannel(subscription);
    }
}

// ============================================
// INITIALIZATION CHECK
// ============================================

/**
 * Check if Supabase is properly initialized
 */
function isSupabaseReady() {
    return supabase !== null && supabase !== undefined;
}

/**
 * Wait for Supabase to be ready
 */
function waitForSupabase(maxWaitMs = 5000) {
    return new Promise((resolve, reject) => {
        if (isSupabaseReady()) {
            resolve(true);
            return;
        }
        
        const checkInterval = 100;
        let elapsed = 0;
        
        const interval = setInterval(() => {
            elapsed += checkInterval;
            
            if (isSupabaseReady()) {
                clearInterval(interval);
                resolve(true);
            } else if (elapsed >= maxWaitMs) {
                clearInterval(interval);
                reject(new Error('Supabase initialization timed out'));
            }
        }, checkInterval);
    });
}

// Export everything
window.SupabaseClient = {
    supabase,
    STORAGE_BUCKETS,
    isAuthenticated,
    getCurrentUser,
    getUserProfile,
    getLawyerProfile,
    uploadFile,
    deleteFile,
    getPublicUrl,
    formatDate,
    formatTime,
    formatCurrency,
    showLoading,
    hideLoading,
    showError,
    showSuccess,
    isValidEmail,
    generateUniqueFilename,
    subscribeToMessages,
    subscribeToConversations,
    unsubscribe,
    withTimeout,
    isSupabaseReady,
    waitForSupabase
};

console.log('✅ Supabase Client initialized successfully');