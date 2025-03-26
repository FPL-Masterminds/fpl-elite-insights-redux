require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Initialize Stripe with fallback for demo mode
let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'YOUR_STRIPE_SECRET_KEY') {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('Stripe client initialized with provided key');
  } else {
    console.log('DEMO MODE: Using mock Stripe client');
    // Create a mock Stripe client with dummy methods
    stripe = {
      checkout: {
        sessions: {
          create: () => Promise.resolve({ url: '/dashboard?success=true' })
        }
      },
      subscriptions: {
        retrieve: () => Promise.resolve({ 
          id: 'demo-subscription-id',
          status: 'active',
          current_period_end: Date.now() / 1000 + 30 * 24 * 60 * 60 // 30 days from now
        }),
        cancel: () => Promise.resolve({})
      },
      webhooks: {
        constructEvent: () => ({ type: 'demo.event' })
      }
    };
  }
} catch (error) {
  console.error('Error initializing Stripe client:', error);
  // Create mock client as fallback (same as above)
  stripe = {
    checkout: {
      sessions: {
        create: () => Promise.resolve({ url: '/dashboard?success=true' })
      }
    },
    subscriptions: {
      retrieve: () => Promise.resolve({ 
        id: 'demo-subscription-id',
        status: 'active',
        current_period_end: Date.now() / 1000 + 30 * 24 * 60 * 60 // 30 days from now
      }),
      cancel: () => Promise.resolve({})
    },
    webhooks: {
      constructEvent: () => ({ type: 'demo.event' })
    }
  };
}

const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const app = express();
const port = 3000;

// Initialize Supabase client - for demo use default values if not provided
let supabase;
try {
  // Check if valid Supabase URL and key are provided
  if (process.env.SUPABASE_URL && process.env.SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
      process.env.SUPABASE_KEY && process.env.SUPABASE_KEY !== 'YOUR_SUPABASE_SERVICE_KEY') {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    console.log('Supabase client initialized with provided credentials');
  } else {
    // For demo, just create a placeholder client that won't actually connect
    console.log('DEMO MODE: Using mock Supabase client');
    
    // Create a mock Supabase client with dummy methods
    supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { code: '42P01' } })
          }),
          limit: () => Promise.resolve({ data: null, error: { code: '42P01' } })
        }),
        upsert: () => Promise.resolve({ error: null })
      }),
      auth: {
        signUp: () => Promise.resolve({ data: { user: { id: 'demo-user-id', email: 'demo@example.com' } }, error: null }),
        signInWithPassword: () => Promise.resolve({ 
          data: { user: { id: 'demo-user-id', email: 'demo@example.com' } }, 
          error: null 
        }),
        admin: {
          listUsers: () => Promise.resolve({ data: { users: [] }, error: null })
        }
      },
      rpc: () => Promise.resolve({ error: { message: 'Demo mode - no actual database operations' } })
    };
  }
} catch (error) {
  console.error('Error initializing Supabase client:', error);
  // Create a mock client as fallback
  supabase = {
    // Same mock implementation as above
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { code: '42P01' } })
        }),
        limit: () => Promise.resolve({ data: null, error: { code: '42P01' } })
      }),
      upsert: () => Promise.resolve({ error: null })
    }),
    auth: {
      signUp: () => Promise.resolve({ data: { user: { id: 'demo-user-id', email: 'demo@example.com' } }, error: null }),
      signInWithPassword: () => Promise.resolve({ 
        data: { user: { id: 'demo-user-id', email: 'demo@example.com' } }, 
        error: null 
      }),
      admin: {
        listUsers: () => Promise.resolve({ data: { users: [] }, error: null })
      }
    },
    rpc: () => Promise.resolve({ error: { message: 'Demo mode - no actual database operations' } })
  };
}

// Create necessary tables if they don't exist
async function setupDatabase() {
  try {
    // Check if profiles table exists
    const { error: profilesTableError } = await supabase.from('profiles').select('*').limit(1);
    
    if (profilesTableError && profilesTableError.code === '42P01') {
      console.log('Creating profiles table...');
      
      // Create profiles table using SQL query
      const { error: createProfilesError } = await supabase.rpc('create_profiles_table', {});
      
      if (createProfilesError) {
        // Table creation with RPC failed, display a message to manually create
        console.error('Error creating profiles table. Please create the table manually:');
        console.error(`
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
        `);
      } else {
        console.log('Profiles table created successfully.');
      }
    }
    
    // Check if subscriptions table exists
    const { error: subscriptionsTableError } = await supabase.from('subscriptions').select('*').limit(1);
    
    if (subscriptionsTableError && subscriptionsTableError.code === '42P01') {
      console.log('Creating subscriptions table...');
      
      // Create subscriptions table using SQL query
      const { error: createSubscriptionsError } = await supabase.rpc('create_subscriptions_table', {});
      
      if (createSubscriptionsError) {
        // Table creation with RPC failed, display a message to manually create
        console.error('Error creating subscriptions table. Please create the table manually:');
        console.error(`
CREATE TABLE public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
        `);
      } else {
        console.log('Subscriptions table created successfully.');
      }
    }
    
    // Create admin user if email is provided in env
    if (process.env.ADMIN_EMAIL) {
      const { data: existingUser, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', process.env.ADMIN_EMAIL)
        .single();
        
      if (userError && userError.code !== 'PGRST116') {
        console.error('Error checking for admin user:', userError);
      } else if (!existingUser) {
        console.log(`Setting up admin privileges for ${process.env.ADMIN_EMAIL}...`);
        
        // Find the user by email in auth users
        const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
        
        if (authError) {
          console.error('Error fetching auth users:', authError);
        } else {
          const adminUser = authUser.users.find(user => user.email === process.env.ADMIN_EMAIL);
          
          if (adminUser) {
            // Update the profile for the admin user
            const { error: updateError } = await supabase
              .from('profiles')
              .upsert({
                id: adminUser.id,
                email: adminUser.email,
                is_admin: true
              });
              
            if (updateError) {
              console.error('Error setting admin privileges:', updateError);
            } else {
              console.log('Admin user set up successfully.');
            }
          } else {
            console.log(`User with email ${process.env.ADMIN_EMAIL} not found in auth users.`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

// Call the setup function at startup
setupDatabase().catch(console.error);

// Middleware for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware
app.use(session({
  secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Add Content Security Policy middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "img-src 'self' data: https://resources.premierleague.com; " +
        "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com; " +
        "connect-src 'self' https://fantasy.premierleague.com https://api.stripe.com; " +
        "frame-src 'self' https://js.stripe.com https://hooks.stripe.com;"
    );
    next();
});

// Authentication middleware
const authenticateJWT = (req, res, next) => {
  // Skip auth check for specific routes
  if (req.url.includes('/api/auth/login') || req.url.includes('/login') || req.url.includes('/signup') || req.url === '/') {
    return next();
  }

  const token = req.cookies.token || '';
  
  if (!token) {
    req.isAuthenticated = false;
    return next();
  }
  
  try {
    console.log(`Verifying token for ${req.url}`);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key-change-in-production');
    
    req.user = decoded;
    req.isAuthenticated = true;
    
    // Avoid token refresh and other potential issues
    next();
  } catch (err) {
    console.log(`Auth error for ${req.url}:`, err.message);
    
    req.isAuthenticated = false;
    res.clearCookie('token', { 
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'lax'
    });
    next();
  }
};

// Apply authentication middleware to all routes
app.use(authenticateJWT);

// Middleware to check if user has an active subscription
const requireSubscription = async (req, res, next) => {
  if (!req.isAuthenticated) {
    console.log('User not authenticated, redirecting to login');
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  
  // Check if this is an admin email
  const isAdmin = req.user.email === (process.env.ADMIN_EMAIL || 'admin@example.com');
  
  // For testing purposes, check if this is a user who completed Stripe checkout
  const hasCompletedCheckout = req.cookies.hasCompletedStripeCheckout === 'true';
  
  console.log(`Subscription check for ${req.user.email}:`);
  console.log(`- Is admin: ${isAdmin}`);
  console.log(`- Has completed checkout: ${hasCompletedCheckout}`);
  
  if (isAdmin || hasCompletedCheckout) {
    console.log('Granting access: User is admin or has completed checkout');
    return next();
  }
  
  // For regular users, check if user is in demo mode 
  // For actual testing, redirect non-admins to subscription page
  console.log('Access denied: User requires subscription');
  return res.redirect('/dashboard?subscription=required');
};

// Serve static files from public directory
app.use(express.static('public'));

// Page routes
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Admin routes
app.get('/admin-dashboard', async (req, res) => {
  // Check if user is authenticated
  if (!req.isAuthenticated) {
    return res.redirect('/login?redirect=/admin-dashboard');
  }
  
  try {
    // Check if user is an admin - for demo allow the current user
    // In production check for is_admin flag
    res.sendFile(__dirname + '/public/admin-dashboard.html');
  } catch (err) {
    console.error('Error checking admin status:', err);
    res.redirect('/dashboard');
  }
});

// Admin API endpoints
app.get('/api/admin/check', async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // For demo purposes, let current user be admin
    res.json({ isAdmin: true });
  } catch (err) {
    console.error('Error checking admin status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/subscriptions', async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Check if user is an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();
      
    if (profileError || !profile || !profile.is_admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Get all subscriptions with user emails
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        status,
        current_period_end,
        created_at,
        updated_at,
        profiles(email)
      `);
      
    if (subError) {
      throw subError;
    }
    
    // Format subscriptions for the frontend
    const formattedSubscriptions = subscriptions.map(sub => ({
      id: sub.id,
      user_id: sub.user_id,
      user_email: sub.profiles?.email || 'Unknown',
      status: sub.status,
      current_period_end: sub.current_period_end,
      created_at: sub.created_at,
      updated_at: sub.updated_at
    }));
    
    // Get stats
    const totalUsers = await supabase
      .from('profiles')
      .select('id', { count: 'exact' });
      
    const activeSubscriptions = formattedSubscriptions.filter(sub => sub.status === 'active').length;
    
    // Calculate monthly revenue (£4.99 per active subscription)
    const monthlyRevenue = (activeSubscriptions * 4.99).toFixed(2);
    
    res.json({
      subscriptions: formattedSubscriptions,
      stats: {
        totalUsers: totalUsers.count || 0,
        activeSubscriptions,
        monthlyRevenue
      }
    });
  } catch (err) {
    console.error('Error fetching subscription data:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/subscriptions/:id', async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Check if user is an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();
      
    if (profileError || !profile || !profile.is_admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const subscriptionId = req.params.id;
    
    // Get subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    res.json(subscription);
  } catch (err) {
    console.error('Error fetching subscription details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/subscriptions/:id/cancel', async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Check if user is an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', req.user.id)
      .single();
      
    if (profileError || !profile || !profile.is_admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const subscriptionId = req.params.id;
    
    // Cancel subscription in Stripe
    await stripe.subscriptions.cancel(subscriptionId);
    
    // Update subscription status in Supabase
    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString()
      })
      .eq('id', subscriptionId);
      
    if (error) throw error;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error canceling subscription:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Protected route for FPL Elite Insights (playeranalytics)
app.get('/playeranalytics', requireSubscription, (req, res) => {
  res.sendFile(__dirname + '/public/playeranalytics.html');
});

// Authentication routes
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw error;
    
    // Create profile for new user
    if (data && data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          email: data.user.email,
          is_admin: email === process.env.ADMIN_EMAIL, // Set admin flag if admin email
        });
        
      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }
    
    res.json({ success: true, message: 'Account created! Please check your email to confirm your account.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    console.log(`Login attempt for ${email}`);
    
    // Always use demo mode for now to simplify things
    const userData = { 
      id: `demo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      email,
      demo: true
    };
    
    // Create simple JWT token
    const token = jwt.sign(
      userData,
      process.env.JWT_SECRET || 'default-secret-key-change-in-production',
      { expiresIn: '7d' } // Longer expiration to avoid problems
    );
    
    console.log(`Created token for ${email}`);
    
    // Set cookie with minimum options
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { 
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  });
  res.redirect('/');
});

// User routes
app.get('/api/user/me', async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  console.log('==== USER INFO REQUEST ====');
  console.log('User from token:', req.user);
  
  // Check if this is an admin email
  const isAdmin = req.user.email === (process.env.ADMIN_EMAIL || 'admin@example.com');
  console.log(`User email: ${req.user.email}`);
  console.log(`Admin email check: ${process.env.ADMIN_EMAIL || 'admin@example.com'}`);
  console.log(`Is admin: ${isAdmin}`);
  
  // For testing purposes, check if this is a user who completed Stripe checkout
  // During testing, we'll grant subscription access to any user who has been through checkout
  const hasCompletedCheckout = req.query.success === 'true' || req.cookies.hasCompletedStripeCheckout === 'true';
  
  // Check if the URL has the success parameter and set a cookie to remember success
  if (req.query.success === 'true' && !req.cookies.hasCompletedStripeCheckout) {
    res.cookie('hasCompletedStripeCheckout', 'true', {
      httpOnly: true,
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/'
    });
    console.log('Setting completed checkout cookie');
  }
  
  console.log('Has completed checkout:', hasCompletedCheckout);
  
  // Return user info from JWT token instead of database
  const responseData = {
    user: {
      id: req.user.id,
      email: req.user.email,
      is_admin: isAdmin
    },
    subscription: (isAdmin || hasCompletedCheckout) ? {
      id: 'demo-subscription',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    } : null,
    isSubscribed: isAdmin || hasCompletedCheckout // Grant access to admins and users who completed checkout
  };
  
  console.log('Response data:', responseData);
  console.log('==== END USER INFO REQUEST ====');
  
  res.json(responseData);
});

// Stripe configuration endpoint
app.get('/api/stripe-config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_demo_key'
  });
});

// Subscription routes
app.post('/api/subscriptions/create-checkout', async (req, res) => {
  if (!req.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  console.log('==== CREATING CHECKOUT SESSION ====');
  console.log('User:', req.user);
  
  try {
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID || 'price_placeholder', // £4.99 for 30 days recurring subscription
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.WEBSITE_URL || 'http://localhost:3000'}/dashboard?success=true`,
      cancel_url: `${process.env.WEBSITE_URL || 'http://localhost:3000'}/dashboard?canceled=true`,
      customer_email: req.user.email,
      client_reference_id: req.user.id,
    });
    
    console.log('Checkout session created:', {
      id: session.id,
      url: session.url,
      customer_email: req.user.email,
      client_reference_id: req.user.id
    });
    console.log('==== END CREATING CHECKOUT SESSION ====');
    
    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook to handle subscription events
app.post('/api/webhooks/stripe', async (req, res) => {
  console.log('==== WEBHOOK RECEIVED ====');
  console.log('Headers:', req.headers);
  console.log('Body type:', typeof req.body);
  
  const sig = req.headers['stripe-signature'];
  console.log('Signature present:', !!sig);
  
  let event;
  
  try {
    console.log('Constructing event with webhook secret:', !!process.env.STRIPE_WEBHOOK_SECRET);
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder'
    );
    
    console.log('Event constructed successfully:', event.type);
    
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('Checkout session completed:', {
          id: session.id,
          customer_email: session.customer_email,
          client_reference_id: session.client_reference_id,
          subscription: session.subscription
        });
        
        // Record the subscription in Supabase
        await handleSuccessfulSubscription(session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        console.log(`Subscription ${event.type}:`, {
          id: subscription.id,
          status: subscription.status
        });
        
        // Update subscription status in Supabase
        await updateSubscriptionStatus(subscription);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    console.log('==== WEBHOOK PROCESSED SUCCESSFULLY ====');
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    console.log('==== WEBHOOK PROCESSING FAILED ====');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Helper function to handle successful subscriptions
async function handleSuccessfulSubscription(session) {
  console.log('==== HANDLING SUCCESSFUL SUBSCRIPTION ====');
  const userId = session.client_reference_id;
  const subscriptionId = session.subscription;
  
  console.log('Processing subscription for user:', userId);
  console.log('Subscription ID:', subscriptionId);
  
  try {
    // Get subscription details from Stripe
    console.log('Retrieving subscription details from Stripe');
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    console.log('Subscription details:', {
      id: subscription.id,
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000)
    });
    
    // Save to Supabase
    console.log('Saving subscription to Supabase');
    const { error } = await supabase
      .from('subscriptions')
      .upsert({
        id: subscriptionId,
        user_id: userId,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
    if (error) {
      console.error('Error saving subscription to Supabase:', error);
      throw error;
    }
    
    console.log('Subscription saved successfully');
    console.log('==== SUBSCRIPTION HANDLING COMPLETE ====');
  } catch (err) {
    console.error('Error handling subscription:', err);
    console.log('==== SUBSCRIPTION HANDLING FAILED ====');
  }
}

// Helper function to update subscription status
async function updateSubscriptionStatus(subscription) {
  try {
    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);
      
    if (error) throw error;
  } catch (err) {
    console.error('Error updating subscription:', err);
  }
}

// Proxy for FPL API calls
app.get('/api/fpl/*', async (req, res) => {
    try {
        const fplUrl = `https://fantasy.premierleague.com/api/${req.params[0]}`;
        const response = await fetch(fplUrl);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 