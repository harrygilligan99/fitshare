// api/webhook.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[webhook] signature failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  const obj = event.data.object;

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const uid = obj.metadata?.supabase_uid;
        if (!uid) break;
        await supabase.from('profiles').update({
          is_pro: true,
          stripe_customer_id: obj.customer,
          pro_expires_at: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString()
        }).eq('id', uid);
        console.log('[webhook] Plus activated for', uid);
        break;
      }

      case 'invoice.paid': {
        // Subscription renewed — find user by customer id
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', obj.customer)
          .single();
        if (!data) break;
        await supabase.from('profiles').update({
          is_pro: true,
          pro_expires_at: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString()
        }).eq('id', data.id);
        console.log('[webhook] Plus renewed for', data.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', obj.customer)
          .single();
        if (!data) break;
        await supabase.from('profiles').update({
          is_pro: false,
          pro_expires_at: null
        }).eq('id', data.id);
        console.log('[webhook] Plus cancelled for', data.id);
        break;
      }
    }
  } catch (e) {
    console.error('[webhook] handler error:', e.message);
    // Still return 200 so Stripe doesn't retry
  }

  return res.status(200).json({ received: true });
}

// Critical: Vercel must not parse body — Stripe needs raw bytes for signature check
export const config = { api: { bodyParser: false } };
