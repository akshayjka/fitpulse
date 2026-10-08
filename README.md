# FitPulse CRM
## Quick test (no install, no database)
Open `public/index.html` in a browser. Leads are saved in localStorage. Admin password: `admin123`.
## Full run with MongoDB
1. Install Node 18+ and MongoDB (or use a free MongoDB Atlas URI).
2. `npm install`
3. Mac/Linux: `ADMIN_KEY=mysecret MONGODB_URI=mongodb://127.0.0.1:27017/fitpulse npm start`
   Windows (PowerShell): `$env:ADMIN_KEY="mysecret"; npm start`
4. Open http://localhost:3000 , click **Admin Portal**, enter your ADMIN_KEY.
## API
POST /api/enquiries | GET /api/enquiries (x-admin-key) | PUT /api/enquiries/:id {status} (x-admin-key) | GET/PUT /api/settings
Deploy: Render/Railway/Fly - set MONGODB_URI and ADMIN_KEY env vars, start command `npm start`.
