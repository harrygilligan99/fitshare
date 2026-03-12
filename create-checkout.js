// api/create-checkout.js
import Stripe from 'stripe';

export default async function handler(req, res) {
  // Allow CORS for same-origin requests
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || 'https://fitshare.co.uk');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { userId, email } = req.body;

  if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

  try {
    // Find or create Stripe customer tied to this user
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customerId = existing.data.length > 0
      ? existing.data[0].id
      : (await stripe.customers.create({ email, metadata: { supabase_uid: userId } })).id;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PLUS_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.SITE_URL}?plus=success`,
      cancel_url: `${process.env.SITE_URL}?plus=cancelled`,
      metadata: { supabase_uid: userId },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[create-checkout]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
