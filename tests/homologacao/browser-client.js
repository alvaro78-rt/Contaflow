const unavailable = async () => {
  throw Object.assign(new Error('Recurso indisponível na homologação'), { status: 503 });
};

export const base44 = {
  app: { getPublicSettings: async () => ({ id: 'contaflow-homologacao', public_settings: {} }) },
  auth: { me: unavailable },
  integrations: { Core: { UploadFile: unavailable } },
  functions: {
    async invoke(name, payload) {
      const response = await fetch('/__homologacao/functions/' + encodeURIComponent(name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(data.error), { data, status: response.status, response: { data } });
      }
      return { data };
    },
  },
};
export const unscoped = base44;
