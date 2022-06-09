import { useCallback, useRef } from 'react';

/** File upload controller */
export const useUpload = () => {
  const upload = useRef<HTMLInputElement>(null);

  const clearUpload = useCallback(() => {
    if (upload.current) {
      upload.current.value = '';
    }
  }, []);

  return { upload, clearUpload };
};
