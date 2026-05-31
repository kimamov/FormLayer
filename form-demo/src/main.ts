import './style.css'




import { formRegistry, registerDefaultValidators } from '../../src/index';

registerDefaultValidators();

formRegistry.init(async (ctx) => {
  const response = await fetch(ctx.formEl.action, {
    method: 'POST',
    body: ctx.formData,
  });

  if (!response.ok) {
    ctx.fallbackToNative();
    return;
  }

  const data = await response.json();

  if (data.errors) {
    ctx.applyValidationErrors(data.errors);
    return;
  }

  ctx.finish('<p>Thank you for your message!</p>');
});