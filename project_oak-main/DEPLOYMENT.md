# Deployment and OAuth Setup

## Free hosting choice

The application can run as one Render Free web service: Express serves both pages and the `/api` routes from the same origin. MongoDB Atlas Free is the database. Render's free web service sleeps after 15 minutes without traffic and can take about a minute to wake; free hosting is suitable for a demo, not a production service. Atlas Free has limited storage and does not provide backups.

## Prepare the database

1. Create a MongoDB Atlas Free cluster and a database user with a strong password.
2. Allow the Render service to connect in Atlas Network Access. Free Render services do not have a fixed outbound IP, so use the narrowest Atlas network rule your account supports; allowing `0.0.0.0/0` is convenient for a demo but exposes the database login to the internet. Use a unique, least-privilege database user.
3. Copy `backend/.env.example` to `backend/.env` for local setup and fill in `MONGODB_URI`, `JWT_SECRET`, `ADMIN_SECRET_KEY`, and a long `SEED_PASSWORD`. Do not commit `.env`.
4. From `backend`, run `npm install` and `npm run seed` once against an empty database. The test admin login is `ADMIN001`; the phone-only general-user test login is `0991234567`. Both use the `SEED_PASSWORD` you chose. Seeded student and teacher accounts use that same password.
5. `npm run seed` refuses to seed a database that already contains users, items, or requests. `npm run seed:reset` deletes those collections first; only use it when you intend to erase the database.

## Configure Google Sign-In

1. In Google Cloud Console, configure the OAuth consent screen and create an OAuth client ID of type **Web application**.
2. Add the deployed origin (for example, `https://project-oak-borrow.onrender.com`) to **Authorized JavaScript origins**. For local testing, add the origin that serves the frontend.
3. The frontend uses Google's popup button and sends its ID token to the API for server-side verification. No redirect URI is needed for this popup flow.
4. Set `GOOGLE_CLIENT_ID` on the Render service. The client ID is public configuration; never put a client secret in frontend code.
5. New Google users must enter a full name and student identifier before an account is created. Google accounts are always assigned the `student` role. Existing records are not linked by email automatically; sign in with the existing account if the student ID or email is already registered.

For local Google Sign-In, run the Express server and open `http://localhost:3000` so `/config.js` can read `GOOGLE_CLIENT_ID` from `backend/.env`. The standalone static preview on port 5501 intentionally uses an empty public config and cannot complete Google Sign-In.

## Deploy on Render

1. Push this project to a GitHub repository. Render needs repository access to build and redeploy it; no Git remote is configured in the current workspace.
2. In Render, create a **Blueprint** from that repository and select the root `render.yaml`.
3. During setup, provide `MONGODB_URI` and `GOOGLE_CLIENT_ID`. Render generates `JWT_SECRET` and `ADMIN_SECRET_KEY` from the Blueprint.
4. Wait for `/health` to pass. The service URL serves the user page at `/` and the admin page at `/admin.html`.
5. Seed the new Atlas database from a trusted local machine using the production `MONGODB_URI` and a private `SEED_PASSWORD`. The deployment does not run the destructive reset command automatically.
6. Test a student login, a new Google account (including required name and student ID), an equipment request, admin approval, a partial return, and the final return. Confirm stock changes and the loan status after each step.

## Local checks

From `backend`, run `npm test` for HTTP smoke tests that do not require MongoDB. Full sign-in, seed, stock transaction, and Google token verification tests require valid Atlas and Google credentials. Approval and return use MongoDB transactions, so use Atlas or a MongoDB replica set.
