import nodemailer from 'nodemailer';

// Hardcoded Gmail SMTP credentials and secure port 465
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'info@rehomebv.com',
    pass: 'bjyw ytex sqej awps'.replace(/\s/g, '') // Remove spaces for app password
  }
});

/**
 * Send an order confirmation email for ReHome orders
 * @param {Object} orderData - Order data including customer info and items
 * @returns {Promise<Object>} - Result of email sending operation
 */
export const sendReHomeOrderEmail = async (orderData) => {
  const { 
    orderNumber, 
    customerEmail, 
    customerFirstName, 
    customerLastName,
    items,
    totalAmount,
    deliveryAddress,
    floor,
    elevatorAvailable,
    baseTotal,
    assistanceCosts,
    pricingBreakdown
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

    const mailOptions = {
      from: `"ReHome BV" <info@rehomebv.com>`,
      to: customerEmail,
      subject: `Second-Hand Furniture Delivery Request - #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://rehomebv.com/assets/logorehome.png" alt="ReHome Logo" style="max-width: 150px;">

          </div>
          
          <h1 style="color: #ff6b35; text-align: center;">Thank You for Your Order!</h1>
          
          <p>Dear ${customerFirstName},</p>
          
          <p>We have received your request and are now integrating it into our delivery schedule. Below is an overview of the next steps so you know what to expect:</p>
          
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
                  <td colspan="2" style="text-align: right; padding: 8px; font-weight: bold;">Items Total:</td>
                  <td style="padding: 8px; font-weight: bold;">€${(baseTotal || totalAmount).toFixed(2)}</td>
                </tr>
                ${(pricingBreakdown?.carryingCost > 0 || pricingBreakdown?.breakdown?.carrying?.totalCost > 0) ? `
                <tr>
                  <td colspan="2" style="text-align: right; padding: 8px;">Carrying Assistance:</td>
                  <td style="padding: 8px;">€${(pricingBreakdown?.carryingCost || pricingBreakdown?.breakdown?.carrying?.totalCost || 0).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${(pricingBreakdown?.assemblyCost > 0 || pricingBreakdown?.breakdown?.assembly?.totalCost > 0) ? `
                <tr>
                  <td colspan="2" style="text-align: right; padding: 8px;">Assembly Assistance:</td>
                  <td style="padding: 8px;">€${(pricingBreakdown?.assemblyCost || pricingBreakdown?.breakdown?.assembly?.totalCost || 0).toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr style="border-top: 2px solid #ff6b35;">
                  <td colspan="2" style="text-align: right; padding: 8px; font-weight: bold;">Total:</td>
                  <td style="padding: 8px; font-weight: bold;">€${totalAmount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            
            ${deliveryAddress && deliveryAddress !== 'To be provided' ? `
            <h3 style="margin-top: 20px; color: #ff6b35; font-size: 16px;">Delivery Details</h3>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
              <p style="margin: 5px 0;"><strong>Address:</strong> ${deliveryAddress}</p>
              <p style="margin: 5px 0;"><strong>Floor:</strong> ${floor || 0} ${elevatorAvailable ? '(Elevator Available)' : ''}</p>
            </div>
            ` : ''}
            
            ${(pricingBreakdown?.carryingCost > 0 || pricingBreakdown?.assemblyCost > 0 || 
               pricingBreakdown?.breakdown?.carrying?.totalCost > 0 || pricingBreakdown?.breakdown?.assembly?.totalCost > 0) ? `
            <h3 style="margin-top: 20px; color: #ff6b35; font-size: 16px;">Delivery Add-ons</h3>
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ff6b35;">
              <p style="margin: 5px 0; font-weight: bold;">Our standard delivery is to the ground floor and certain items may be disassembled.</p>
              ${(pricingBreakdown?.carryingCost > 0 || pricingBreakdown?.breakdown?.carrying?.totalCost > 0) ? 
                `<p style="margin: 5px 0;">✅ Carrying assistance to floor ${floor || 0} requested</p>` : ''}
              ${(pricingBreakdown?.assemblyCost > 0 || pricingBreakdown?.breakdown?.assembly?.totalCost > 0) ? 
                `<p style="margin: 5px 0;">✅ Assembly assistance requested</p>` : ''}
            </div>
            ` : ''}
          </div>
          
          <h2 style="color: #ff6b35; font-size: 18px;">What's Next?</h2>
          <ol>
            <li>1️⃣ Order Received – Your order has been successfully placed, and we are reviewing the best possible delivery date.</li>
            <li>2️⃣ Delivery Scheduling – Once we determine a delivery date, we will send you a final order confirmation email with the invoice and expected delivery date.</li>
            <li>3️⃣ Delivery Timeline – We typically deliver within 1-2 weeks. If adjustments are needed, we will coordinate with you.</li>
            <li>4️⃣ Completion – Your item(s) will be delivered. You can pay upon delivery with card or later by bank transfer.</li>
            <li>⚠️ Important: If we cannot integrate your order into our schedule, we may need to cancel.</li>
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
    };




    const result = await transporter.sendMail(mailOptions);
    console.log('✅ ReHome order email sent successfully:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error("❌ Error sending ReHome order email:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a moving request confirmation email
 * @param {Object} movingData - Moving request data including customer info and details
 * @returns {Promise<Object>} - Result of email sending operation
 */
export const sendMovingRequestEmail = async (movingData) => {
  const { 
    customerEmail, 
    customerFirstName, 
    customerLastName,
    serviceType, // 'item-moving' or 'house-moving'
    pickupLocation,
    dropoffLocation,
    selectedDateRange,
    isDateFlexible,
    estimatedPrice,
    orderSummary // New parameter for complete order details
  } = movingData;

  try {
    const serviceName = serviceType === 'item-moving' ? 'Item Transport' : 'House Moving';
    const dateText = isDateFlexible ? 'Flexible' : `${new Date(selectedDateRange.start).toLocaleDateString()}`;

    // Generate order summary HTML if available
    let orderSummaryHtml = '';
    if (orderSummary) {
      orderSummaryHtml = `
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #333; margin-bottom: 15px;">Order Summary</h3>
          
          <!-- Pickup & Delivery Details -->
          <div style="margin-bottom: 20px;">
            <h4 style="color: #ff6b35; margin-bottom: 10px;">Pickup & Delivery Details</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <p style="margin: 5px 0;"><strong>Pickup Address:</strong></p>
                <p style="margin: 5px 0; color: #666;">${orderSummary.pickupDetails.address}</p>
                <p style="margin: 5px 0; color: #666;">Floor: ${orderSummary.pickupDetails.floor} ${orderSummary.pickupDetails.elevator ? '(Elevator Available)' : ''}</p>
              </div>
              <div>
                <p style="margin: 5px 0;"><strong>Delivery Address:</strong></p>
                <p style="margin: 5px 0; color: #666;">${orderSummary.deliveryDetails.address}</p>
                <p style="margin: 5px 0; color: #666;">Floor: ${orderSummary.deliveryDetails.floor} ${orderSummary.deliveryDetails.elevator ? '(Elevator Available)' : ''}</p>
              </div>
            </div>
          </div>
          
          <!-- Schedule -->
          <div style="margin-bottom: 20px;">
            <h4 style="color: #ff6b35; margin-bottom: 10px;">Schedule</h4>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${orderSummary.schedule.date}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${orderSummary.schedule.time}</p>
          </div>
          
          <!-- Items -->
          <div style="margin-bottom: 20px;">
            <h4 style="color: #ff6b35; margin-bottom: 10px;">Items</h4>
            ${orderSummary.items.map(item => `
              <p style="margin: 5px 0; color: #666;">${item.name} - x${item.quantity}</p>
            `).join('')}
          </div>
          
          <!-- Additional Services -->
          <div style="margin-bottom: 20px;">
            <h4 style="color: #ff6b35; margin-bottom: 10px;">Additional Services</h4>
            ${orderSummary.additionalServices.assembly > 0 ? `<p style="margin: 5px 0; color: #666;">Assembly & Disassembly: €${orderSummary.additionalServices.assembly.toFixed(2)}</p>` : ''}
            ${orderSummary.additionalServices.extraHelper > 0 ? `<p style="margin: 5px 0; color: #666;">Extra Helper: €${orderSummary.additionalServices.extraHelper.toFixed(2)}</p>` : ''}
            ${orderSummary.additionalServices.carrying > 0 ? `<p style="margin: 5px 0; color: #666;">Floor Carrying Cost: €${orderSummary.additionalServices.carrying.toFixed(2)}</p>` : ''}
            ${orderSummary.additionalServices.studentDiscount > 0 ? `<p style="margin: 5px 0; color: #28a745;">Student Discount (10%): -€${orderSummary.additionalServices.studentDiscount.toFixed(2)}</p>` : ''}
          </div>
          
          <!-- Contact Information -->
          <div style="margin-bottom: 20px;">
            <h4 style="color: #ff6b35; margin-bottom: 10px;">Contact Information</h4>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${orderSummary.contactInfo.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${orderSummary.contactInfo.email}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${orderSummary.contactInfo.phone}</p>
          </div>
          
          <!-- Total Price -->
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ff6b35;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h4 style="margin: 0; color: #333;">Total Price:</h4>
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #ff6b35;">€${orderSummary.totalPrice.toFixed(2)}</p>
            </div>
          </div>
        </div>
      `;
    }

    const mailOptions = {
      from: `"ReHome BV" <info@rehomebv.com>`,
      to: customerEmail,
      subject: `${serviceName} Request Confirmation`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #ff6b35; margin-bottom: 10px;">ReHome BV</h1>
            <p style="color: #666; margin: 0;">Your trusted moving partner</p>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">Thank you for your ${serviceName} request!</h2>
          
          <p>Dear ${customerFirstName} ${customerLastName},</p>
          
          <p>Thank you for your request! We have received your booking and will now review your preferred date and time to match it with our schedule. Below are the details we have on file:</p>
          
          ${orderSummaryHtml}
          
          <h2 style="color: #ff6b35; font-size: 18px;">What's Next?</h2>
          <div style="margin: 0; padding-left: 0;">
            <div style="margin-bottom: 10px;">1️⃣ Review – We will review your request and match it with our schedule.</div>
            <div style="margin-bottom: 10px;">2️⃣ Contact – You will receive a final quote and proposal via email or WhatsApp.</div>
            <div style="margin-bottom: 10px;">3️⃣ Arrange – If the proposed date/time does not work for you, please contact us via WhatsApp or Email with a screenshot of the mail. We will work together to find a suitable date.</div>
            <div style="margin-bottom: 10px;">4️⃣ Confirmation – Once we agree on a date and time, we will send you a confirmation email with an invoice.</div>
            <div style="margin-bottom: 10px;">5️⃣ Completion – We will carry out the service as scheduled. You can pay by card after the service was carried out or later by bank transfer.</div>
          </div>
          
          <p>In the meantime, if you have any questions or need to provide additional information, please don't hesitate to contact us at <a href="mailto:info@rehomebv.com">info@rehomebv.com</a>.</p>
          
          <p>Want to explore more about our services? Check out our marketplace:</p>
          <a href="https://rehomebv.com/marketplace" style="display: inline-block; background-color: #ff6b35; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Visit Our Marketplace</a>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #777;">
            <p>© ${new Date().getFullYear()} ReHome BV. All rights reserved.</p>
            <p>This email was sent to confirm your moving request. If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Moving request email sent successfully:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error("❌ Error sending moving request email:", error);
    return { success: false, error: error.message };
  }
};

export default {
  sendReHomeOrderEmail,
  sendMovingRequestEmail
};
