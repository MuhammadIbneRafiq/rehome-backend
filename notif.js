import { Resend } from 'resend';

// Initialize Resend only if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Send an order confirmation email for ReHome orders
 * @param {Object} orderData - Order data including customer info and items
 * @returns {Promise<Object>} - Result of email sending operation
 */
export const sendReHomeOrderEmail = async (orderData) => {
  if (!resend) {
    console.warn('Resend API key not configured - ReHome order email not sent');
    return { success: false, message: 'Email service not configured' };
  }

  const { 
    orderNumber, 
    customerEmail, 
    customerFirstName, 
    customerLastName,
    items,
    totalAmount
  } = orderData;

  try {
    // Generate item list HTML
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">€${item.price.toFixed(2)}</td>
      </tr>
    `).join('');

    const result = await resend.emails.send({
      from: 'ReHome <orders@rehomebv.com>',
      to: customerEmail,
      subject: `Your ReHome Order Confirmation - #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://rehomebv.com/logo.png" alt="ReHome Logo" style="max-width: 150px;">
          </div>
          
          <h1 style="color: #ff6b35; text-align: center;">Thank You for Your Order!</h1>
          
          <p>Dear ${customerFirstName},</p>
          
          <p>We're excited to confirm your ReHome order. Our team will review your order details and get back to you shortly with pricing and delivery information.</p>
          
          <div style="background-color: #f9f9f9; border-radius: 5px; padding: 15px; margin: 20px 0;">
            <h2 style="margin-top: 0; color: #ff6b35; font-size: 18px;">Order Summary</h2>
            <p><strong>Order Number:</strong> #${orderNumber}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            
            <h3 style="margin-top: 20px; color: #ff6b35; font-size: 16px;">Items</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th style="text-align: left; padding: 8px;">Item</th>
                  <th style="text-align: left; padding: 8px;">Qty</th>
                  <th style="text-align: left; padding: 8px;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="text-align: right; padding: 8px; font-weight: bold;">Total:</td>
                  <td style="padding: 8px; font-weight: bold;">€${totalAmount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <h2 style="color: #ff6b35; font-size: 18px;">What's Next?</h2>
          <ol>
            <li>Our team will review your order</li>
            <li>We'll contact you with final pricing and delivery options</li>
            <li>Once confirmed, we'll schedule your delivery</li>
          </ol>
          
          <p>If you have any questions about your order, please contact us:</p>
          <ul style="list-style-type: none; padding-left: 0;">
            <li><strong>Email:</strong> <a href="mailto:info@rehomebv.com" style="color: #ff6b35;">info@rehomebv.com</a></li>
            <li><strong>Phone/WhatsApp:</strong> <a href="https://wa.me/31645839273" style="color: #ff6b35;">+31 645 839 273</a></li>
          </ul>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #777;">
            <p>© ${new Date().getFullYear()} ReHome BV. All rights reserved.</p>
            <p>This email was sent to confirm your order with ReHome. If you didn't place this order, please contact us immediately.</p>
          </div>
        </div>
      `
    });
    
    console.log('✅ ReHome order email sent successfully:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error("❌ Error sending ReHome order email:", error);
    return { success: false, error: error.message };
  }
};

export default {
  sendReHomeOrderEmail
};
