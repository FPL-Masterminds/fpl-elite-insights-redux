# FPL Elite Insights

A premium Fantasy Premier League (FPL) analytics platform providing exclusive insights from the Top 50 FPL managers in the world.

## Features

- User authentication with Supabase
- Subscription payments with Stripe (£4.99/month)
- Paywalled premium content
- Top 50 manager player ownership data
- Multiple analysis views:
  - All Players
  - Recommended Players
  - Pitch View
  - Differentials
  - Points Optimized Team
- Admin dashboard for subscription management

## Demo Mode

The application includes a demo mode that works without real API credentials, allowing for easy testing and deployment.

## Deployment

### Prerequisites
- Node.js and npm installed
- [Supabase](https://supabase.io) account (for production)
- [Stripe](https://stripe.com) account (for production)

### Local Development
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm start
   ```
4. Open http://localhost:3000 in your browser

### Deploy to Vercel
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure the following environment variables in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID`
   - `JWT_SECRET`
   - `WEBSITE_URL` (your Vercel deployment URL)
   - `ADMIN_EMAIL` (email of the admin account)
4. Deploy!

## License

This project is licensed under the MIT License. 