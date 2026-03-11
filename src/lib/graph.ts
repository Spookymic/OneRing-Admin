import { Client } from "@microsoft/microsoft-graph-client";

export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}
