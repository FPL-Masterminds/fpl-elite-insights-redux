# Deployment Guide for FPL Elite Insights

This guide provides step-by-step instructions for deploying the FPL Elite Insights platform to Vercel.

## Prerequisites

Before deploying, you need:

1. A [Supabase](https://supabase.com) account and project
2. A [Stripe](https://stripe.com) account
3. A [Vercel](https://vercel.com) account

## Step 1: Set Up Supabase

1. Create a new Supabase project
2. In the SQL editor, run these commands to create the necessary tables:

```sql
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Set up Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile" 
  ON profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Set up Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own subscriptions" 
  ON subscriptions FOR SELECT 
  USING (auth.uid() = user_id);
```

3. From the Supabase dashboard, get your:
   - Project URL
   - Service role key (API KEY)

## Step 2: Set Up Stripe

1. Create a product in Stripe:
   - Name: "FPL Elite Insights"
   - Set up a recurring Price:
     - Amount: £4.99
     - Billing period: Monthly
     - Currency: GBP

2. From the Stripe dashboard, get your:
   - Publishable key
   - Secret key
   - The Price ID of your subscription product
   - (Optional) Set up webhook endpoints for production

## Step 3: Deploy to Vercel

### Option 1: Direct Deployment (Recommended)

1. Install Vercel CLI:
   ```
   npm install -g vercel
   ```

2. Run the deployment command in your project directory:
   ```
   vercel
   ```

3. Follow the prompts to connect your Vercel account

4. **IMPORTANT**: When asked about environment variables, do NOT use the values from your .env file directly. 
   Instead, provide your actual Supabase and Stripe credentials.

### Option 2: GitHub Deployment

1. Create a GitHub repository
2. Push your code to GitHub (exclude the .env file using .gitignore)
3. Connect your GitHub repository to Vercel
4. Configure the environment variables in the Vercel dashboard

## Step 4: Configure Environment Variables in Vercel

Set the following environment variables in your Vercel project settings:

1. `SUPABASE_URL` - Your Supabase project URL
2. `SUPABASE_KEY` - Your Supabase service role key
3. `STRIPE_SECRET_KEY` - Your Stripe secret key
4. `STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key
5. `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret (if using webhooks)
6. `STRIPE_PRICE_ID` - Your Stripe subscription price ID
7. `JWT_SECRET` - A long, random string for JWT token signing
8. `WEBSITE_URL` - Your Vercel deployment URL
9. `ADMIN_EMAIL` - The email of the admin account

## Step 5: Test Your Deployment

After deployment:

1. Register a new account
2. Log in
3. Access the dashboard
4. Test the subscription process (use Stripe test card: 4242 4242 4242 4242)
5. Verify access to the paywalled content

## Step 6: Set Up Admin Access

1. Sign up with the email you specified as `ADMIN_EMAIL`
2. This account will automatically have admin access

## Troubleshooting

If you encounter issues:

1. Check Vercel deployment logs
2. Verify all environment variables are correctly set
3. Test user authentication and subscription flows
4. Confirm Supabase tables were created properly

For more help, refer to:
- [Vercel documentation](https://vercel.com/docs)
- [Supabase documentation](https://supabase.com/docs)
- [Stripe documentation](https://stripe.com/docs) 