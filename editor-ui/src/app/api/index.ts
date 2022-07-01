import axios from 'axios';

const instance = axios.create({
  baseURL:
    process.env.NODE_ENV === 'development'
      ? `http://localhost:3000/api`
      : `${window.location.origin}/api`,
  withCredentials: true,
});

const api = {
  render: () => ({
    post: async (code: string) => await instance.post<string>('/v1/render', { source: code }),
  }),
};

export default api;
