/**
 * Integrator transport for server validation (until the TYPO3 adapter ships
 * one, issue #10): posts the whole form with `X-Form-Validate: <fields>` and
 * expects `{ fields, form }` back. The mock backend in server/mock-api.ts
 * answers these requests.
 */
import type { ServerValidationOptions } from 'formlayer';

export const playgroundServerValidation: ServerValidationOptions = {
  async validate({ fields, formData, signal, form }) {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'X-Form-Ajax': '1', 'X-Form-Validate': fields.join(',') },
      body: formData,
      signal,
    });
    if (!response.ok) throw new Error(`Server validation failed with ${response.status}`);
    return response.json();
  },
};
