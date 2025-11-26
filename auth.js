// ============================================
// AUTHENTICATION SYSTEM - FIXED VERSION
// ============================================
// File: js/auth.js
// Requires: supabase-client.js

var { supabase, isAuthenticated, getCurrentUser, uploadFile, STORAGE_BUCKETS, showError, showSuccess, isValidEmail } = window.SupabaseClient;

// ============================================
// SIGN UP FUNCTIONALITY
// ============================================

/**
 * Check if email already exists in the system
 */
async function checkEmailExists(email) {
    try {
        // Check in auth.users first
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        // Since we can't use admin API from client, we'll check the users table instead
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email.toLowerCase())
            .maybeSingle();
        
        if (userError && userError.code !== 'PGRST116') {
            console.error('Error checking email:', userError);
        }
        
        return { exists: !!users, user: users };
    } catch (error) {
        console.error('Error checking email existence:', error);
        return { exists: false, user: null };
    }
}

/**
 * Sign up a new user WITH email verification (for new signups)
 */
async function signUpWithVerification(params) {
    const { email, password, firstName, lastName, accountType, cnic, photo } = params;
    const fullName = `${firstName} ${lastName}`;
    const profilePhoto = photo;
    try {
        // Validate inputs
        if (!email || !password || !fullName || !accountType || !cnic) {
            throw new Error('All fields are required');
        }
        
        if (!isValidEmail(email)) {
            throw new Error('Invalid email format');
        }
        
        // Validate password strength
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(password)) {
            throw new Error('Password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            throw new Error('Password must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(password)) {
            throw new Error('Password must contain at least one number');
        }
        
        // Check if email already exists in users table
        const { exists, user: existingUser } = await checkEmailExists(email);
        
        if (exists) {
            console.log('Email already exists in database');
            throw new Error('An account with this email already exists. Please login or use a different email.');
        }
        
        console.log('Email is available, proceeding with signup...');
        
        // Create auth user with email verification ENABLED
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/login.html`,
                data: {
                    full_name: fullName,
                    account_type: accountType.toLowerCase(),
                    cnic: cnic
                }
            }
        });
        
        if (authError) {
            console.error('Auth signup error:', authError);
            
            // Check for specific Supabase auth errors
            if (authError.message.includes('User already registered')) {
                throw new Error('An account with this email already exists. Please login or reset your password.');
            }
            
            throw authError;
        }
        
        if (!authData.user) {
            throw new Error('Failed to create user account');
        }
        
        console.log('Auth user created:', authData.user.id);
        
        // Check if this is a duplicate signup attempt (user exists in auth but not confirmed)
        if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
            console.log('User exists but not confirmed, will send new verification email');
            return {
                success: true,
                needsConfirmation: true,
                message: 'A verification email has been sent. Please check your email to verify your account.',
                user: authData.user,
                email: email
            };
        }
        
        // For new signups, ALWAYS require email confirmation
        // User won't be able to login until they click the email link
        return {
            success: true,
            needsConfirmation: true,
            message: 'Please check your email to verify your account before logging in.',
            user: authData.user,
            email: email
        };
        
    } catch (error) {
        console.error('Signup error:', error);
        
        // Provide more specific error messages
        let errorMessage = error.message;
        
        if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
            errorMessage = 'An account with this email already exists. Please login or use a different email.';
        } else if (error.message.includes('User already registered')) {
            errorMessage = 'An account with this email already exists. Please login or reset your password.';
        } else if (error.message.includes('violates foreign key constraint')) {
            errorMessage = 'Database configuration error. Please contact support.';
        } else if (error.message.includes('permission denied')) {
            errorMessage = 'Database permission error. Please contact support.';
        }
        
        return { success: false, error: errorMessage };
    }
}

/**
 * Sign up a new user (legacy - without verification)
 */
async function signUp(email, password, fullName, accountType, cnic, profilePhoto = null) {
    try {
        // Validate inputs
        if (!email || !password || !fullName || !accountType || !cnic) {
            throw new Error('All fields are required');
        }
        
        if (!isValidEmail(email)) {
            throw new Error('Invalid email format');
        }
        
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }
        
        // Create auth user with metadata
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/login.html`,
                data: {
                    full_name: fullName,
                    account_type: accountType.toLowerCase(),
                    cnic: cnic
                }
            }
        });
        
        if (authError) {
            console.error('Auth signup error:', authError);
            throw authError;
        }
        
        if (!authData.user) {
            throw new Error('Failed to create user account');
        }
        
        console.log('Auth user created:', authData.user.id);
        
        // Check if email confirmation is required
        const needsEmailConfirmation = authData.user && 
            !authData.user.confirmed_at && 
            (!authData.user.identities || authData.user.identities.length === 0);
        
        if (needsEmailConfirmation) {
            console.log('Email confirmation required');
            return {
                success: true,
                needsConfirmation: true,
                message: 'Please check your email to confirm your account.',
                user: authData.user
            };
        }
        
        const userId = authData.user.id;
        
        // Upload profile photo if provided
        let profilePhotoUrl = null;
        if (profilePhoto) {
            try {
                const fileName = `${userId}/${Date.now()}_${profilePhoto.name}`;
                profilePhotoUrl = await uploadFile(STORAGE_BUCKETS.PROFILE_PHOTOS, profilePhoto, fileName);
                console.log('Profile photo uploaded:', profilePhotoUrl);
            } catch (photoError) {
                console.error('Photo upload error (non-critical):', photoError);
                // Continue even if photo upload fails
            }
        }
        
        // Split full name into first and last name
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || nameParts[0];
        
        // Insert into users table
        const { error: userError } = await supabase
            .from('users')
            .insert({
                id: userId,
                email,
                user_type: accountType.toLowerCase(),
                first_name: firstName,
                last_name: lastName,
                profile_photo_url: profilePhotoUrl
            });
        
        if (userError) {
            console.error('User table insert error:', userError);
            throw new Error(`Failed to create user profile: ${userError.message}`);
        }
        
        console.log('User profile created');
        
        // If lawyer, create lawyer profile
        if (accountType.toLowerCase() === 'lawyer') {
            const { error: lawyerError } = await supabase
                .from('lawyers')
                .insert({
                    id: userId,
                    bar_registration_no: cnic // Using CNIC as bar reg temporarily
                });
            
            if (lawyerError) {
                console.error('Lawyer table insert error:', lawyerError);
                throw new Error(`Failed to create lawyer profile: ${lawyerError.message}`);
            }
            
            console.log('Lawyer profile created');
        }
        
        return { success: true, user: authData.user };
        
    } catch (error) {
        console.error('Signup error:', error);
        
        // Provide more specific error messages
        let errorMessage = error.message;
        
        if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
            errorMessage = 'An account with this email already exists';
        } else if (error.message.includes('violates foreign key constraint')) {
            errorMessage = 'Database configuration error. Please contact support.';
        } else if (error.message.includes('permission denied')) {
            errorMessage = 'Database permission error. Please contact support.';
        }
        
        return { success: false, error: errorMessage };
    }
}

/**
 * Resend verification email
 */
async function resendVerificationEmail(email) {
    try {
        console.log('Attempting to resend verification email to:', email);
        
        const { data, error } = await supabase.auth.resend({
            type: 'signup',
            email: email
        });
        
        if (error) {
            console.error('Resend error:', error);
            throw error;
        }
        
        console.log('Verification email resent successfully');
        return { success: true };
    } catch (error) {
        console.error('Resend verification error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// LOGIN FUNCTIONALITY
// ============================================

/**
 * Log in a user
 */
async function login(email, password) {
    try {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            console.error('Login error:', error);
            throw error;
        }
        
        if (!data.user) {
            throw new Error('Login failed - no user returned');
        }
        
        console.log('User logged in:', data.user.id);
        
        // Get user profile to determine user type
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('user_type')
            .eq('id', data.user.id)
            .single();
        
        if (userError) {
            console.error('Error fetching user type:', userError);
            throw new Error('Failed to load user profile');
        }
        
        // Store user type in localStorage for quick access
        localStorage.setItem('userType', userData.user_type);
        
        return { 
            success: true, 
            user: data.user,
            userType: userData.user_type 
        };
        
    } catch (error) {
        console.error('Login error:', error);
        
        // Provide user-friendly error messages
        let errorMessage = error.message;
        
        if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Invalid email or password';
        } else if (error.message.includes('Email not confirmed')) {
            errorMessage = 'Please confirm your email before logging in';
        }
        
        return { success: false, error: errorMessage };
    }
}

// ============================================
// LOGOUT FUNCTIONALITY
// ============================================

/**
 * Log out current user
 */
async function logout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        // Clear local storage
        localStorage.removeItem('userType');
        
        console.log('User logged out');
        return { success: true };
        
    } catch (error) {
        console.error('Logout error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PASSWORD RESET
// ============================================

/**
 * Send password reset email
 */
async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        
        if (error) throw error;
        
        return { success: true };
        
    } catch (error) {
        console.error('Password reset error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update password
 */
async function updatePassword(currentPassword, newPassword) {
    try {
        // First verify current password by trying to sign in
        const user = await getCurrentUser();
        if (!user || !user.email) {
            throw new Error('No user logged in');
        }
        
        const { error: verifyError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword
        });
        
        if (verifyError) {
            throw new Error('Current password is incorrect');
        }
        
        // Update to new password
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        
        return { success: true };
        
    } catch (error) {
        console.error('Password update error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PROFILE UPDATES
// ============================================

/**
 * Update user profile
 */
async function updateProfile(userId, updates) {
    try {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);
        
        if (error) throw error;
        
        return { success: true };
        
    } catch (error) {
        console.error('Profile update error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update profile photo
 */
async function updateProfilePhoto(userId, photoFile) {
    try {
        if (!photoFile) throw new Error('No photo file provided');
        
        // Get current profile to check for existing photo
        const { data: currentProfile } = await supabase
            .from('users')
            .select('profile_photo_url')
            .eq('id', userId)
            .single();
        
        // If there's an old photo, delete it from storage
        if (currentProfile?.profile_photo_url) {
            await deleteProfilePhotoFromStorage(currentProfile.profile_photo_url);
        }
        
        // Upload new photo
        // Sanitize filename - remove spaces and special characters
        const cleanName = photoFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${userId}/${Date.now()}_${cleanName}`;
        const photoUrl = await uploadFile(STORAGE_BUCKETS.PROFILE_PHOTOS, photoFile, fileName);
        
        if (!photoUrl) throw new Error('Failed to upload photo');
        
        // Update user record
        const result = await updateProfile(userId, { 
            profile_photo_url: photoUrl 
        });
        
        if (!result.success) throw new Error(result.error);
        
        return { success: true, photoUrl };
        
    } catch (error) {
        console.error('Photo update error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Remove profile photo (sets to null and deletes from storage)
 */
async function removeProfilePhoto(userId) {
    try {
        // Get current profile photo URL
        const { data: currentProfile } = await supabase
            .from('users')
            .select('profile_photo_url')
            .eq('id', userId)
            .single();
        
        if (currentProfile?.profile_photo_url) {
            // Delete from storage
            await deleteProfilePhotoFromStorage(currentProfile.profile_photo_url);
        }
        
        // Update user record to null
        const result = await updateProfile(userId, { 
            profile_photo_url: null 
        });
        
        if (!result.success) throw new Error(result.error);
        
        return { success: true };
        
    } catch (error) {
        console.error('Photo removal error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Helper function to delete profile photo from storage
 */
async function deleteProfilePhotoFromStorage(photoUrl) {
    try {
        const { deleteFile, STORAGE_BUCKETS } = window.SupabaseClient;
        
        // Extract file path from URL
        // URL format: https://[project].supabase.co/storage/v1/object/public/profile-photos/[userId]/[filename]
        const urlParts = photoUrl.split('/');
        const bucketIndex = urlParts.indexOf('profile-photos');
        
        if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
            // Get the path after the bucket name (userId/filename)
            const filePath = urlParts.slice(bucketIndex + 1).join('/');
            console.log('Deleting photo from storage:', filePath);
            await deleteFile(STORAGE_BUCKETS.PROFILE_PHOTOS, filePath);
        }
    } catch (error) {
        console.error('Error deleting photo from storage:', error);
        // Don't throw - we still want to update the database even if storage deletion fails
    }
}

/**
 * Update lawyer profile
 */
async function updateLawyerProfile(lawyerId, updates) {
    try {
        const { error } = await supabase
            .from('lawyers')
            .update(updates)
            .eq('id', lawyerId);
        
        if (error) throw error;
        
        return { success: true };
        
    } catch (error) {
        console.error('Lawyer profile update error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// AUTH STATE MANAGEMENT
// ============================================

/**
 * Check if user is logged in and redirect if needed
 */
async function requireAuth(redirectTo = 'login.html') {
    const authed = await isAuthenticated();
    
    if (!authed) {
        window.location.href = redirectTo;
        return false;
    }
    
    return true;
}

/**
 * Get current user type
 */
function getUserType() {
    return localStorage.getItem('userType') || null;
}

/**
 * Listen to auth state changes
 */
function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

// ============================================
// INITIALIZE STORAGE BUCKETS (Run once)
// ============================================

/**
 * Create storage buckets if they don't exist
 */
async function initializeStorageBuckets() {
    const buckets = [
        STORAGE_BUCKETS.PROFILE_PHOTOS,
        STORAGE_BUCKETS.DOCUMENTS,
        STORAGE_BUCKETS.CHAT_ATTACHMENTS
    ];
    
    for (const bucket of buckets) {
        try {
            const { data, error } = await supabase.storage.getBucket(bucket);
            
            if (error && error.message.includes('not found')) {
                // Create bucket
                const { error: createError } = await supabase.storage.createBucket(bucket, {
                    public: true,
                    fileSizeLimit: 5242880 // 5MB
                });
                
                if (createError) {
                    console.error(`Failed to create bucket ${bucket}:`, createError);
                } else {
                    console.log(`✅ Created storage bucket: ${bucket}`);
                }
            }
        } catch (error) {
            console.error(`Error checking bucket ${bucket}:`, error);
        }
    }
}

// Run initialization
initializeStorageBuckets();

// Export everything
window.Auth = {
    signUp,
    signUpWithVerification,
    resendVerificationEmail,
    checkEmailExists,
    login,
    logout,
    resetPassword,
    updatePassword,
    updateProfile,
    updateProfilePhoto,
    removeProfilePhoto,
    updateLawyerProfile,
    requireAuth,
    getUserType,
    onAuthStateChange
};

console.log('✅ Authentication system initialized');