# Setting Up Stripe for FPL Elite Insights

This guide will help you integrate your Stripe account with the FPL Elite Insights application to process subscription payments.

## 1. Set Up Your Stripe Product and Price

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Go to Products > Create Product
3. Set the product details:
   - Name: "FPL Elite Insights"
   - Description: "Exclusive access to Top 50 FPL manager data and analytics"
4. Create a recurring price:
   - Amount: £4.99
   - Currency: GBP
   - Billing period: Monthly
   - Tick "Automatically bill customers when the subscription ends"
5. Save the product

## 2. Get Your Stripe API Keys

1. In your Stripe Dashboard, go to Developers > API Keys
2. You'll see two keys:
   - Publishable key: starts with `pk_`
   - Secret key: starts with `sk_`
3. For testing, use the test mode keys (`pk_test_` and `sk_test_`)
4. For production, use the live mode keys (`pk_live_` and `sk_live_`)

## 3. Update Your Environment Variables

Add your Stripe keys to your `.env` file:

```
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PRICE_ID=price_your_price_id
```

Where to find the PRICE_ID:
1. Go to Products in your Stripe Dashboard
2. Find your FPL Elite Insights product
3. Click on it and find the Price ID (starts with `price_`)

## 4. Testing the Integration

1. Use Stripe's test card numbers to test the payment flow:
   - Card number: 4242 4242 4242 4242
   - Expiry date: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

2. After a successful test payment, you should see:
   - The payment in your Stripe Dashboard
   - The user getting access to the premium content

## 5. Going Live

When you're ready to accept real payments:

1. Complete your Stripe account setup (business details, bank account, etc.)
2. Switch your API keys to the live mode versions in your `.env` file
3. Deploy your application

## 6. Setting Up Webhooks (Optional but Recommended)

For better subscription management:

1. Go to Developers > Webhooks in your Stripe Dashboard
2. Add an endpoint URL: `https://your-website.com/api/webhooks/stripe`
3. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Get your webhook signing secret and add it to your environment variables:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

## Troubleshooting

- Check Stripe logs in your Dashboard if payments are failing
- Ensure your webhook endpoint is correctly configured if subscription status isn't updating
- Verify that your price ID is correct if the checkout doesn't show the right amount

For more help, refer to the [Stripe Documentation](https://stripe.com/docs). 