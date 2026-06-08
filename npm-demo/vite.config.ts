import { defineConfig, type Plugin } from 'vite';

function mockTypo3Api(): Plugin {
  return {
    name: 'mock-typo3-api',
    configureServer(server) {
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
    ],
  },
});
