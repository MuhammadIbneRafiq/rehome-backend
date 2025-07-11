const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { supabaseClient } = require('../../db/params.js');

const router = express.Router();

// Google OAuth callback endpoint
router.post('/google/callback', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    
    console.log('🔑 Google OAuth callback received');
    console.log('Code:', code ? code.substring(0, 10) + '...' : 'Missing');
    console.log('Redirect URI:', redirect_uri);

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ Google OAuth credentials not configured');
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    // Exchange authorization code for access token
    console.log('🔄 Exchanging code for tokens...');
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { access_token, id_token, refresh_token } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('No access token received from Google');
    }

    console.log('✅ Tokens received from Google');

    // Get user info from Google
    console.log('🔄 Fetching user info from Google...');
    const userInfoResponse = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${access_token}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/json'
        }
      }
    );

    const googleUser = userInfoResponse.data;
    console.log('👤 Google user info:', { 
      email: googleUser.email, 
      name: googleUser.name,
      id: googleUser.id 
    });

    // Check if user exists in Supabase
    console.log('🔄 Checking/creating user in database...');
    let dbUser;
    
    // First, try to find existing user by email
    const { data: existingUsers, error: fetchError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('email', googleUser.email)
      .limit(1);

    if (fetchError) {
      console.error('❌ Error fetching user:', fetchError);
    }

    if (existingUsers && existingUsers.length > 0) {
      dbUser = existingUsers[0];
      console.log('✅ Found existing user:', dbUser.email);
      
      // Update user info if needed
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({
          name: googleUser.name,
          avatar_url: googleUser.picture,
          google_id: googleUser.id,
          last_sign_in: new Date().toISOString()
        })
        .eq('id', dbUser.id);

      if (updateError) {
        console.error('❌ Error updating user:', updateError);
      }
    } else {
      // Create new user
      console.log('🔄 Creating new user...');
      const { data: newUsers, error: insertError } = await supabaseClient
        .from('profiles')
        .insert([
          {
            email: googleUser.email,
            name: googleUser.name,
            avatar_url: googleUser.picture,
            google_id: googleUser.id,
            auth_provider: 'google',
            created_at: new Date().toISOString(),
            last_sign_in: new Date().toISOString()
          }
        ])
        .select();

      if (insertError) {
        console.error('❌ Error creating user:', insertError);
        return res.status(500).json({ 
          error: 'Failed to create user account',
          details: insertError.message 
        });
      }

      dbUser = newUsers[0];
      console.log('✅ Created new user:', dbUser.email);
    }

    // Generate custom JWT token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const customToken = jwt.sign(
      {
        userId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        provider: 'google',
        google_id: googleUser.id
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    console.log('✅ Custom JWT token generated');

    // Return user data and access token
    res.json({
      accessToken: customToken,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatar_url: dbUser.avatar_url,
        provider: 'google'
      },
      google_access_token: access_token,
      google_refresh_token: refresh_token
    });

  } catch (error) {
    console.error('❌ Google OAuth callback error:', error);
    
    let errorMessage = 'Authentication failed';
    if (error.response?.data?.error_description) {
      errorMessage = error.response.data.error_description;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(400).json({ 
      error: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

module.exports = router; 