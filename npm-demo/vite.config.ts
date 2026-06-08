import { createChallenge, pbkdf2 } from 'altcha/lib';
import { defineConfig, type Plugin } from 'vite';

const DEMO_HMAC_SECRET = 'npm-demo-altcha-secret';

function mockTypo3Api(): Plugin {
  return {
    name: 'mock-typo3-api',
    configureServer(server) {
      server.middlewares.use('/api/altcha/challenge', async (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }

        try {
          const challenge = await createChallenge({
            algorithm: 'PBKDF2/SHA-256',
            cost: 1,
            deriveKey: pbkdf2.deriveKey,
            hmacSignatureSecret: DEMO_HMAC_SECRET,
            keyPrefixLength: 2,
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(challenge));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      server.middlewares.use('/api/registration', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            valid: true,
            finished: true,
            message: '<p class="success">Registration received — thank you!</p>',
          }),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [mockTypo3Api()],
  optimizeDeps: {
    include: [
      'formlayer',
      'formlayer/typo3',
      'formlayer-plugin-combobox',
      'formlayer-plugin-client-variants',
      'formlayer-plugin-datepicker',
      'formlayer-plugin-altcha/typo3',
      'altcha',
      'altcha/lib',
    ],
  },
});
