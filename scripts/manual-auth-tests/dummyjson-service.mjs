import { BaseApiService, RestProtocol } from '@gears-frontx/api';

export class DummyJsonService extends BaseApiService {
  constructor() {
    super({ baseURL: 'https://dummyjson.com' }, new RestProtocol({ timeout: 10_000 }));
  }

  login() {
    return this.protocol(RestProtocol).post('/auth/login', {
      username: 'emilys',
      password: 'emilyspass',
      expiresInMins: 5,
    });
  }

  me(options) {
    return this.protocol(RestProtocol).get('/auth/me', options);
  }
}
