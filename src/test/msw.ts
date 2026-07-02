import { setupServer } from "msw/node";

// Serveur MSW partagé par les tests. Les handlers sont ajoutés par test via server.use(...).
export const server = setupServer();
