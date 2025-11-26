// ============================================
// PAYMENT SYSTEM
// ============================================
// File: js/payment.js
// Requires: supabase-client.js

const { supabase } = window.SupabaseClient;

// ============================================
// PAYMENT METHODS
// ============================================

/**
 * Add payment method for user
 */
async function addPaymentMethod(userId, paymentData) {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .insert({
                user_id: userId,
                payment_type: paymentData.type, // 'card', 'paypal', 'bank'
                card_type: paymentData.cardType,
                last_four_digits: paymentData.lastFour,
                expiry_month: paymentData.expiryMonth,
                expiry_year: paymentData.expiryYear,
                is_default: paymentData.isDefault || false
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error adding payment method:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user payment methods
 */
async function getUserPaymentMethods(userId) {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false });

        if (error) throw error;

        return { success: true, data: data || [] };

    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return { success: false, error: error.message, data: [] };
    }
}

/**
 * Delete payment method
 */
async function deletePaymentMethod(paymentMethodId) {
    try {
        const { error } = await supabase
            .from('payment_methods')
            .delete()
            .eq('id', paymentMethodId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error deleting payment method:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set default payment method
 */
async function setDefaultPaymentMethod(userId, paymentMethodId) {
    try {
        // First, unset all as default
        await supabase
            .from('payment_methods')
            .update({ is_default: false })
            .eq('user_id', userId);

        // Then set the selected one as default
        const { error } = await supabase
            .from('payment_methods')
            .update({ is_default: true })
            .eq('id', paymentMethodId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error setting default payment method:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PAYMENT PROCESSING
// ============================================

/**
 * Process payment (simulation - integrate with real payment gateway)
 */
async function processPayment(paymentData) {
    try {
        // In a real application, this would integrate with:
        // - Stripe
        // - PayPal
        // - Local payment gateway (JazzCash, Easypaisa for Pakistan)
        
        // Validate payment data
        if (!paymentData.amount || paymentData.amount <= 0) {
            throw new Error('Invalid payment amount');
        }

        if (!paymentData.appointmentId) {
            throw new Error('Appointment ID required');
        }

        // Simulate payment processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create payment record
        const paymentRecord = {
            appointment_id: paymentData.appointmentId,
            amount: paymentData.amount,
            currency: paymentData.currency || 'PKR',
            payment_method: paymentData.paymentMethod,
            status: 'completed',
            transaction_id: generateTransactionId(),
            payment_date: new Date().toISOString()
        };

        // In real app, you'd save this to a payments table
        // For now, we'll update the appointment with payment info
        const { error: updateError } = await supabase
            .from('appointments')
            .update({ 
                status: 'confirmed',
                // Add payment_status field if you want to track it
            })
            .eq('id', paymentData.appointmentId);

        if (updateError) throw updateError;

        return { 
            success: true, 
            transactionId: paymentRecord.transaction_id,
            paymentRecord 
        };

    } catch (error) {
        console.error('Payment processing error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate transaction ID
 */
function generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `TXN-${timestamp}-${random}`;
}

/**
 * Calculate consultation fee with service fee
 */
function calculateTotalFee(consultationFee, serviceFeePercentage = 0.15) {
    const serviceFee = consultationFee * serviceFeePercentage;
    const total = consultationFee + serviceFee;
    
    return {
        consultationFee,
        serviceFee: Math.round(serviceFee),
        total: Math.round(total)
    };
}

/**
 * Generate payment receipt data
 */
function generateReceipt(paymentData, appointmentData, lawyerData) {
    return {
        receiptNumber: paymentData.transactionId,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        clientName: appointmentData.clientName,
        lawyerName: lawyerData.name,
        serviceType: appointmentData.title,
        consultationFee: paymentData.consultationFee,
        serviceFee: paymentData.serviceFee,
        totalAmount: paymentData.amount,
        currency: paymentData.currency,
        paymentMethod: paymentData.paymentMethod,
        status: 'Paid'
    };
}

/**
 * Download receipt as text (basic implementation)
 */
function downloadReceipt(receiptData) {
    const receiptText = `
=====================================
       BRIEF-CASE RECEIPT
=====================================

Receipt No: ${receiptData.receiptNumber}
Date: ${receiptData.date}
Time: ${receiptData.time}

-------------------------------------
CLIENT INFORMATION
-------------------------------------
Name: ${receiptData.clientName}

-------------------------------------
SERVICE DETAILS
-------------------------------------
Lawyer: ${receiptData.lawyerName}
Service: ${receiptData.serviceType}

-------------------------------------
PAYMENT BREAKDOWN
-------------------------------------
Consultation Fee:  ${receiptData.currency} ${receiptData.consultationFee.toLocaleString()}
Service Fee:       ${receiptData.currency} ${receiptData.serviceFee.toLocaleString()}
                  ─────────────────
Total Amount:      ${receiptData.currency} ${receiptData.totalAmount.toLocaleString()}

Payment Method: ${receiptData.paymentMethod}
Status: ${receiptData.status}

=====================================
Thank you for using Brief-Case!
Your case, our counsel.
=====================================
    `;

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${receiptData.receiptNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/**
 * Validate card number (basic Luhn algorithm)
 */
function validateCardNumber(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    
    if (digits.length < 13 || digits.length > 19) {
        return false;
    }

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i]);

        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        isEven = !isEven;
    }

    return sum % 10 === 0;
}

/**
 * Get card type from number
 */
function getCardType(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    
    if (/^4/.test(digits)) return 'Visa';
    if (/^5[1-5]/.test(digits)) return 'Mastercard';
    if (/^3[47]/.test(digits)) return 'American Express';
    if (/^6(?:011|5)/.test(digits)) return 'Discover';
    
    return 'Unknown';
}

/**
 * Format card number for display
 */
function formatCardNumber(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    return digits.replace(/(\d{4})/g, '$1 ').trim();
}

/**
 * Mask card number (show only last 4 digits)
 */
function maskCardNumber(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    const lastFour = digits.slice(-4);
    return `**** **** **** ${lastFour}`;
}

// Export everything
window.Payment = {
    addPaymentMethod,
    getUserPaymentMethods,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    processPayment,
    calculateTotalFee,
    generateReceipt,
    downloadReceipt,
    validateCardNumber,
    getCardType,
    formatCardNumber,
    maskCardNumber
};

console.log('✅ Payment system initialized');