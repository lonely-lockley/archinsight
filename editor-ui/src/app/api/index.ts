import axios from 'axios';
import TranslatorResponse from './TranslatorResponse';

const instance = axios.create({
  baseURL:
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3333/api`
      : `${window.location.origin}/api`,
  withCredentials: true,
});

const api = {
  render: () => ({
    post: async (code: string) => await instance.post<TranslatorResponse>('/v1/render', { source: code }),
  }),
};

export default api;
