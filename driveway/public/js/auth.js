import { api } from './api.js';
import { modal, closeModal, setUser, store, showFormErrors, clearFormErrors, formData } from './state.js';
import { toast, $ } from './format.js';

const signupForm = `
  <h2>Create account</h2>
  <p class="sub">Free forever. Sell cars, make offers, set standing bids.</p>
  <form class="form-grid" data-form="signup" novalidate>
    <div class="form-err" data-form-error hidden></div>
    <div class="f"><label for="su-name">Full name</label><input id="su-name" name="name" autocomplete="name" placeholder="Alex Johnson"></div>
    <div class="f"><label for="su-email">Email</label><input id="su-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"></div>
    <div class="row2">
      <div class="f"><label for="su-phone">Phone</label><input id="su-phone" name="phone" autocomplete="tel" placeholder="(555) 123-4567"></div>
      <div class="f"><label for="su-zip">ZIP code</label><input id="su-zip" name="zip" inputmode="numeric" maxlength="5" placeholder="78701"></div>
    </div>
    <div class="f"><label for="su-pass">Password</label><input id="su-pass" name="password" type="password" autocomplete="new-password" placeholder="8+ characters"></div>
    <button class="btn btn-primary btn-lg" type="submit">Sign up</button>
  </form>
  <div class="switch-auth">Already have an account? <a data-switch="login">Log in</a></div>`;

const loginForm = `
  <h2>Welcome back</h2>
  <p class="sub">Log in to manage your listings and offers.</p>
  <form class="form-grid" data-form="login" novalidate>
    <div class="form-err" data-form-error hidden></div>
    <div class="f"><label for="li-email">Email</label><input id="li-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"></div>
    <div class="f"><label for="li-pass">Password</label><input id="li-pass" name="password" type="password" autocomplete="current-password"></div>
    <button class="btn btn-primary btn-lg" type="submit">Log in</button>
  </form>
  <div class="switch-auth">New to Driveway? <a data-switch="signup">Create account</a></div>`;

/** Opens the auth modal; `then` runs once the user is signed in. */
export function openAuth(mode = 'signup', then = null) {
  const back = modal(mode === 'login' ? loginForm : signupForm);

  back.querySelector('[data-switch]')?.addEventListener('click', () => openAuth(mode === 'login' ? 'signup' : 'login', then));

  const form = $('form', back);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const body = formData(form);
      const { user } = await api.post(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', body);
      setUser(user);
      if (user.zip) store.setZip(user.zip);
      closeModal();
      toast(mode === 'login' ? `Welcome back, ${user.name.split(' ')[0]}!` : `Welcome to Driveway, ${user.name.split(' ')[0]}! 🎉`);
      then?.();
    } catch (err) {
      showFormErrors(form, err);
    } finally {
      button.disabled = false;
    }
  });
}

/** Runs `action` when signed in, otherwise asks the user to sign in first. */
export function requireAuth(action) {
  if (store.user) return action();
  openAuth('signup', action);
}

export async function logout() {
  await api.post('/api/auth/logout');
  setUser(null);
  toast('Logged out.');
  location.hash = '#/browse';
}

export function verifyFunds() {
  requireAuth(() => {
    const back = modal(`
      <h2>Verify your funds</h2>
      <p class="sub">Sellers see verified offers first — it is the difference between a real buyer and a tyre-kicker.</p>
      <div class="note demo"><b>Prototype note:</b> a real build connects a bank aggregator or a lender's pre-approval API. This button just flips the flag so you can see how the badge works.</div>
      <button class="btn btn-primary btn-lg" style="width:100%;margin-top:14px" data-go>Connect bank account (demo)</button>`);
    back.querySelector('[data-go]').addEventListener('click', async () => {
      const { user } = await api.post('/api/auth/verify-funds');
      setUser(user);
      closeModal();
      toast('✅ Funds verified — your offers now carry the badge.');
    });
  });
}
