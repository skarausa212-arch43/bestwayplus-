/**
 * LUMI native bootstrap — runs only inside the Capacitor shell (no-op on web).
 *
 * Loads before the app script (which reads window.LUMI_API_BASE to hit the live
 * backend). Handles native push: asks permission, gets the FCM token, and
 * registers it against the signed-in user; re-registers whenever the user logs
 * in; routes a notification tap to the in-app deep link.
 */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;   // web → do nothing
  var Push = Cap.Plugins && Cap.Plugins.PushNotifications;
  var AppPlugin = Cap.Plugins && Cap.Plugins.App;
  var API = (window.LUMI_API_BASE || 'https://lumi24.pl').replace(/\/$/, '');
  var platform = (Cap.getPlatform && Cap.getPlatform()) || 'android';
  var fcmToken = null;
  var lastSent = null;

  function authToken() { try { return localStorage.getItem('cg_token'); } catch (e) { return null; } }

  // Send the device token to the backend for the current user (once per pair).
  function registerToken() {
    var jwt = authToken();
    if (!fcmToken || !jwt) return;
    var pair = jwt.slice(0, 12) + ':' + fcmToken.slice(0, 12);
    if (pair === lastSent) return;
    fetch(API + '/api/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt },
      body: JSON.stringify({ token: fcmToken, platform: platform })
    }).then(function (r) { if (r.ok) lastSent = pair; }).catch(function () {});
  }

  function navigateDeepLink(link) {
    // Notifications carry lumi://<segment>/<arg>; the SPA understands the hash router.
    if (!link) return;
    var m = /^lumi:\/\/(.+)$/.exec(link);
    if (m) { try { location.hash = '#' + m[1]; } catch (e) {} }
  }

  if (Push) {
    Push.addListener('registration', function (t) { fcmToken = t && t.value; registerToken(); });
    Push.addListener('registrationError', function (e) { /* keep silent; retry on next launch */ });
    Push.addListener('pushNotificationActionPerformed', function (ev) {
      var data = (ev && ev.notification && ev.notification.data) || {};
      navigateDeepLink(data.deepLink);
    });
    Push.checkPermissions().then(function (p) {
      if (p.receive === 'granted') return Push.register();
      return Push.requestPermissions().then(function (r) { if (r.receive === 'granted') return Push.register(); });
    }).catch(function () {});
  }

  // The FCM token arrives before the user logs in — retry registration when auth
  // appears (login) and when the app returns to the foreground.
  setInterval(registerToken, 4000);
  if (AppPlugin && AppPlugin.addListener) AppPlugin.addListener('appStateChange', function (s) { if (s && s.isActive) registerToken(); });
})();
