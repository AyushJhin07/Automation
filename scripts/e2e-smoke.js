#!/usr/bin/env node
// Dev-only smoke: checks roadmap and status endpoints
import fetch from 'node-fetch';

async function ping(url, opts){
  try { const r = await fetch(url, opts); const t = await r.text(); return { ok: r.ok, status: r.status, body: t.slice(0, 500) }; } catch(e){ return { ok:false, error: e.message }; }
}

async function main(){
  const base = process.env.BASE_URL || 'http://localhost:5000';
  console.log('Pinging', base);
  console.log('Roadmap:', await ping(`${base}/api/roadmap`));
  console.log('Connectors:', await ping(`${base}/api/status/connectors`));
  console.log('Rate limits:', await ping(`${base}/api/status/rate-limits`));
  console.log('Features:', await ping(`${base}/api/health/features`));
}

main();

