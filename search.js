// ============================================
// SEARCH FUNCTIONALITY
// ============================================
// File: js/search.js
// Requires: supabase-client.js

const { supabase } = window.SupabaseClient;

// Cache control for fresh data
let queryCache = {};
function clearQueryCache() {
    queryCache = {};
}

// ============================================
// LAWYER SEARCH
// ============================================

/**
 * Search lawyers with filters
 */
async function searchLawyers(filters = {}) {
    try {
        console.log('🔍 searchLawyers called with filters:', filters);
        
        // Changed !inner to left join so lawyers without practice areas also show
        let query = supabase
            .from('lawyers')
            .select(`
                *,
                users!inner(
                    id,
                    email,
                    first_name,
                    last_name,
                    profile_photo_url
                ),
                lawyer_practice_areas(
                    practice_areas(name)
                )
            `);

        // NOTE: We do NOT filter by search query at database level
        // because user names are in a nested relationship (users table)
        // We'll do all text search filtering on the client side below

        // Apply specialty filter only if specified
        if (filters.specialty && filters.specialty.trim()) {
            // We'll filter this on the client side since it's a nested relationship
        }

        // Apply rating filter
        if (filters.minRating) {
            query = query.gte('average_rating', parseFloat(filters.minRating));
        }

        // Apply fee filter
        if (filters.maxFee) {
            query = query.lte('consultation_fee', parseFloat(filters.maxFee));
        }

        // Apply consultation type filter
        if (filters.consultationType && filters.consultationType.trim()) {
            query = query.or(
                `consultation_type.eq.${filters.consultationType},` +
                `consultation_type.eq.both`
            );
        }

        // Get all data first, then sort on client side
        const { data, error } = await query;

        if (error) {
            console.error('❌ Supabase query error:', error);
            throw error;
        }

        console.log('📊 Raw data from database:', data);

        let results = data || [];

        // Client-side filtering for specialty
        if (filters.specialty && filters.specialty.trim()) {
            results = results.filter(lawyer => {
                if (!lawyer.lawyer_practice_areas || lawyer.lawyer_practice_areas.length === 0) {
                    return false;
                }
                return lawyer.lawyer_practice_areas.some(pa => 
                    pa.practice_areas && pa.practice_areas.name === filters.specialty
                );
            });
        }

        // Client-side filtering for search query in user names
        if (filters.searchQuery && filters.searchQuery.trim()) {
            const searchTerm = filters.searchQuery.trim().toLowerCase();
            results = results.filter(lawyer => {
                const firstName = (lawyer.users?.first_name || '').toLowerCase();
                const lastName = (lawyer.users?.last_name || '').toLowerCase();
                const lawFirm = (lawyer.law_firm || '').toLowerCase();
                const bio = (lawyer.biography || '').toLowerCase();
                
                return firstName.includes(searchTerm) || 
                       lastName.includes(searchTerm) ||
                       lawFirm.includes(searchTerm) ||
                       bio.includes(searchTerm);
            });
        }

        // Sort by rating (handle null values)
        results.sort((a, b) => {
            const ratingA = a.average_rating || 0;
            const ratingB = b.average_rating || 0;
            return ratingB - ratingA;
        });

        console.log('✅ Final filtered results:', results.length, 'lawyers');

        return { success: true, data: results };

    } catch (error) {
        console.error('❌ Search error:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get all practice areas
 */
async function getPracticeAreas() {
    try {
        const { data, error } = await supabase
            .from('practice_areas')
            .select('*')
            .order('name');

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching practice areas:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get lawyer details by ID
 */
async function getLawyerDetails(lawyerId) {
    try {
        const { data, error } = await supabase
            .from('lawyers')
            .select(`
                *,
                users!inner(
                    id,
                    email,
                    first_name,
                    last_name,
                    phone_number,
                    profile_photo_url
                ),
                lawyer_practice_areas(
                    practice_areas(id, name)
                ),
                lawyer_payment_methods(
                    payment_method
                )
            `)
            .eq('id', lawyerId)
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error fetching lawyer details:', error);
        return { success: false, error: error.message, data: null };
    }
}

/**
 * Get lawyer availability
 */
async function getLawyerAvailability(lawyerId) {
    try {
        const { data, error } = await supabase
            .from('lawyer_availability')
            .select('*')
            .eq('lawyer_id', lawyerId)
            .eq('is_available', true);

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching availability:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Get booked appointment slots for a lawyer
 */
async function getBookedSlots(lawyerId, date) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('appointment_time')
            .eq('lawyer_id', lawyerId)
            .eq('appointment_date', date)
            .in('status', ['scheduled', 'rescheduled']);

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching booked slots:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// ============================================
// APPOINTMENTS
// ============================================

/**
 * Create an appointment
 */
async function createAppointment(appointmentData) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .insert({
                client_id: appointmentData.clientId,
                lawyer_id: appointmentData.lawyerId,
                appointment_date: appointmentData.date,
                appointment_time: appointmentData.time,
                title: appointmentData.title || 'Consultation',
                description: appointmentData.description,
                meeting_type: appointmentData.meetingType,
                status: 'scheduled'
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error creating appointment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user appointments
 */
async function getUserAppointments(userId, status = null) {
    try {
        let query = supabase
            .from('appointments')
            .select(`
                *,
                lawyers!inner(
                    users!inner(first_name, last_name, profile_photo_url)
                )
            `)
            .or(`client_id.eq.${userId},lawyer_id.eq.${userId}`)
            .order('appointment_date', { ascending: true });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching appointments:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Update appointment
 */
async function updateAppointment(appointmentId, updates) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .update(updates)
            .eq('id', appointmentId)
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error updating appointment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cancel appointment (sets status to cancelled)
 */
async function cancelAppointment(appointmentId) {
    return updateAppointment(appointmentId, { status: 'cancelled' });
}

/**
 * Delete appointment (permanently removes from database)
 */
async function deleteAppointment(appointmentId) {
    try {
        console.log('Deleting appointment:', appointmentId);
        
        const { data, error, count } = await supabase
            .from('appointments')
            .delete()
            .eq('id', appointmentId)
            .select();

        console.log('Delete result:', { data, error, count });

        if (error) {
            console.error('Delete error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.warn('No appointment was deleted - may not exist or permission denied');
            return { success: false, error: 'Could not delete appointment. Check permissions.' };
        }

        console.log('Appointment deleted successfully');
        return { success: true };

    } catch (error) {
        console.error('Error deleting appointment:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// REVIEWS
// ============================================

/**
 * Calculate and update lawyer's average rating
 */
async function updateLawyerRating(lawyerId) {
    try {
        console.log('📊 Recalculating rating for lawyer:', lawyerId);
        
        // Get all reviews for this lawyer
        const { data: reviews, error: reviewError } = await supabase
            .from('reviews')
            .select('rating')
            .eq('lawyer_id', lawyerId);

        if (reviewError) throw reviewError;

        if (!reviews || reviews.length === 0) {
            // No reviews yet, set to default
            const { error: updateError } = await supabase
                .from('lawyers')
                .update({
                    average_rating: 5.0,
                    total_reviews: 0
                })
                .eq('id', lawyerId);

            if (updateError) throw updateError;
            
            console.log('✅ Set default rating (no reviews)');
            return { success: true, average: 5.0, count: 0 };
        }

        // Calculate average
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / reviews.length;
        const roundedAverage = Math.round(averageRating * 10) / 10; // Round to 1 decimal

        console.log('📈 Calculated:', {
            total: totalRating,
            count: reviews.length,
            average: roundedAverage
        });

        // Update lawyer record
        const { error: updateError } = await supabase
            .from('lawyers')
            .update({
                average_rating: roundedAverage,
                total_reviews: reviews.length
            })
            .eq('id', lawyerId);

        if (updateError) throw updateError;

        console.log('✅ Rating updated successfully');
        return { success: true, average: roundedAverage, count: reviews.length };

    } catch (error) {
        console.error('❌ Error updating lawyer rating:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get lawyer reviews
 */
async function getLawyerReviews(lawyerId) {
    try {
        const { data, error } = await supabase
            .from('reviews')
            .select(`
                *,
                users!client_id(first_name, last_name, profile_photo_url)
            `)
            .eq('lawyer_id', lawyerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching reviews:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Create a review and update lawyer rating
 */
async function createReview(reviewData) {
    try {
        console.log('📝 Creating review:', reviewData);
        
        // Insert the review
        const { data, error } = await supabase
            .from('reviews')
            .insert({
                lawyer_id: reviewData.lawyerId,
                client_id: reviewData.clientId,
                appointment_id: reviewData.appointmentId,
                rating: reviewData.rating,
                review_text: reviewData.reviewText
            })
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Review created:', data);

        // Immediately recalculate and update lawyer's average rating
        const ratingUpdate = await updateLawyerRating(reviewData.lawyerId);
        
        if (!ratingUpdate.success) {
            console.warn('⚠️ Review created but rating calculation failed:', ratingUpdate.error);
        } else {
            console.log('✅ Lawyer rating updated:', ratingUpdate);
        }

        return { success: true, data };

    } catch (error) {
        console.error('Error creating review:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// DOCUMENTS
// ============================================

/**
 * Upload document
 */
async function uploadDocument(userId, file, documentType) {
    try {
        const { uploadFile, STORAGE_BUCKETS } = window.SupabaseClient;
        
        // Sanitize filename - remove special characters and spaces
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${userId}/${Date.now()}_${cleanFileName}`;
        const fileUrl = await uploadFile(STORAGE_BUCKETS.DOCUMENTS, file, fileName);

        if (!fileUrl) throw new Error('File upload failed');

        const { data, error } = await supabase
            .from('documents')
            .insert({
                user_id: userId,
                document_name: file.name,
                document_type: documentType,
                file_url: fileUrl,
                file_size: file.size,
                mime_type: file.type
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error uploading document:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user documents
 */
async function getUserDocuments(userId) {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('user_id', userId)
            .order('uploaded_at', { ascending: false });

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching documents:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Delete document
 */
async function deleteDocument(documentId, fileUrl) {
    try {
        const { deleteFile, STORAGE_BUCKETS } = window.SupabaseClient;
        
        // Extract file path from URL
        const urlParts = fileUrl.split('/');
        const filePath = urlParts.slice(-2).join('/'); // userId/filename

        // Delete from storage
        await deleteFile(STORAGE_BUCKETS.DOCUMENTS, filePath);

        // Delete from database
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', documentId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error deleting document:', error);
        return { success: false, error: error.message };
    }
}

// Export everything
window.Search = {
    searchLawyers,
    getPracticeAreas,
    getLawyerDetails,
    getLawyerAvailability,
    getBookedSlots,
    createAppointment,
    getUserAppointments,
    updateAppointment,
    cancelAppointment,
    deleteAppointment,
    getLawyerReviews,
    createReview,
    updateLawyerRating,
    uploadDocument,
    getUserDocuments,
    deleteDocument,
    clearQueryCache
};

console.log('✅ Search system initialized');