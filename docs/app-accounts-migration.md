# App Accounts: update procedure for existing Reps

Applies to every rep who today works from a device locked to "Rep" mode, or who has
a login without a `roles` entry. Nothing is lost: sales history is matched by the
rep's name, and the name is carried over exactly.

## Before you start (once, by the admin)
1. Make sure every rep with unsent work opens the app online and syncs (the cloud
   icon turns green). Local data is stored per login, so unsynced items must be
   uploaded before a rep switches to a different login.
2. Deploy `firestore.rules`, then the new app version.
3. Sign in as the admin. Your own user document must be an admin (`roles: ["admin"]`
   or the old `role: "admin"`). If you were the only account, nothing else is needed.

## For each existing rep (admin)
1. Settings, then Security, then **App Accounts**.
2. The panel **Existing reps without a login** lists every name in the rep list that
   has no Rep account yet. Tap the rep's name. The Name field is filled in exactly
   (upper case) and only the **Rep** role is selected.
3. Enter the rep's **Email** and **Password** (8+ characters).
   - Rep has no login yet: choose a new password.
   - Rep already signs in with an email: enter that same email and the **current**
     password. The existing login is adopted (same user id, so the rep's local data
     stays on the device) and only its roles are changed.
   - A login that belongs to another workspace is refused.
4. Tap **Add Account**. The rep appears under **Registered Accounts** with **Rep** on.
   Add more roles (for example Sales) by tapping them on the same row.

## On the rep's device
1. Open the app online and sign in with the account from step 3. The role is applied
   automatically; the app reloads once.
2. The rep sees only the Rep tab (or the tabs of the roles you gave) with their own
   customer list and their own history. Other reps' records never appear, because
   both lists are filtered to the rep's own name.
3. The old device-assigned lock is no longer used. Until a rep has signed in online
   once with a roles account, the device keeps working in its old mode.

## Later changes
- Change roles any time on the account row. They take effect on the rep's device
  within seconds (one automatic reload).
- **Suspend** signs the rep out immediately. **Reinstate** lets them back in.
- **Remove** signs them out and deletes the account record. Their sales history stays,
  and adding the same email again re-uses the login.

## Check
- The rep's name in the list equals the name on their old sales (`salesRep`). If a
  history looks empty, the name was typed differently: add the account again using
  the name tapped from the panel.
