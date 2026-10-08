import {
  acceptInvite,
  getSettings,
  handleAuthCallback,
  login,
  logout,
  oauthLogin,
  requestPasswordRecovery,
  signup,
  updateUser,
} from '@netlify/identity';

let inviteToken = null;

function showAuth(mode = 'login', settings = {}) {
  const { openM } = window.Nearby;
  const reset = mode === 'reset' || mode === 'invite';
  const registration = mode === 'signup';
  const title = reset ? 'Set your password' : registration ? 'Create your account' : 'Sign in to Nearby';
  document.getElementById('sheet').innerHTML = `
    <h2>${title}</h2>
    <p class="meta">${reset ? 'Choose a new password for your account.' : 'Book local businesses and manage your visits.'}</p>
    <form id="auth-form">
      ${registration ? '<label for="auth-name">Your name</label><input id="auth-name" name="name" autocomplete="name" maxlength="100" required>' : ''}
      ${reset ? '' : '<label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required>'}
      <label for="auth-password">Password</label><input id="auth-password" name="password" type="password" minlength="8" autocomplete="${registration || reset ? 'new-password' : 'current-password'}" required>
      <p id="auth-message" class="meta" role="status" aria-live="polite"></p>
      <div class="row"><button id="auth-submit" class="btn" type="submit">${reset ? 'Save password' : registration ? 'Create account' : 'Sign in'}</button><button class="btn ghost" type="button" onclick="window.Nearby.closeM()">Cancel</button></div>
    </form>
    ${reset ? '' : `<div class="row" style="margin-top:16px">${registration ? '<button class="btn ghost sm" onclick="openAuth()">Already have an account?</button>' : `${settings.disableSignup ? '' : '<button class="btn ghost sm" onclick="openAuth(\'signup\')">Create account</button>'}<button class="btn ghost sm" id="forgot-password">Forgot password?</button>`}</div>`}
    ${!reset && settings.providers?.google ? '<button class="btn ghost" id="google-login" style="margin-top:12px">Continue with Google</button>' : ''}
  `;
  const form = document.getElementById('auth-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('auth-submit');
    const message = document.getElementById('auth-message');
    const fields = new FormData(form);
    button.disabled = true;
    message.textContent = 'Connecting…';
    try {
      if (mode === 'invite') {
        await acceptInvite(inviteToken, fields.get('password'));
        inviteToken = null;
      } else if (mode === 'reset') {
        await updateUser({ password: fields.get('password') });
      } else if (registration) {
        const account = await signup(fields.get('email'), fields.get('password'), { full_name: fields.get('name') });
        if (!account.confirmedAt) {
          message.textContent = 'Check your email to confirm your account, then sign in.';
          return;
        }
      } else {
        await login(fields.get('email'), fields.get('password'));
      }
      window.Nearby.closeM();
      await window.Nearby.retryLoad();
      window.Nearby.toast(reset ? 'Password saved.' : 'Signed in.');
    } catch (error) {
      message.textContent = error.message || 'Could not sign in. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('forgot-password')?.addEventListener('click', async () => {
    const input = document.getElementById('auth-email');
    const message = document.getElementById('auth-message');
    if (!input.value || !input.reportValidity()) return;
    try {
      await requestPasswordRecovery(input.value);
      message.textContent = 'Check your email for a password reset link.';
    } catch (error) {
      message.textContent = error.message || 'Could not request a password reset.';
    }
  });
  document.getElementById('google-login')?.addEventListener('click', () => {
    oauthLogin('google').catch((error) => {
      document.getElementById('auth-message').textContent = error.message;
    });
  });
  openM();
  form.querySelector('input')?.focus();
}

window.openAuth = async (mode = 'login') => {
  try {
    const settings = await getSettings();
    showAuth(mode, settings);
  } catch {
    window.Nearby.toast('Sign-in is temporarily unavailable. Please try again.');
  }
};

window.signOut = async () => {
  try {
    await logout();
  } finally {
    window.location.replace('/');
  }
};

window.NearbyAuth = {
  async processCallback() {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite') {
      inviteToken = callback.token;
      showAuth('invite');
    } else if (callback?.type === 'recovery') {
      showAuth('reset');
    } else if (callback) {
      window.Nearby.toast('Your account is verified.');
    }
  },
};
