import React, { ChangeEvent, FC } from 'react';

import FileUploadIcon from '@mui/icons-material/FileUpload';
import { Fab, Tooltip, Typography } from '@mui/material';

type Props = {
  fileName: string;
  upload: React.RefObject<HTMLInputElement>;
  onLoad: (event: ChangeEvent<HTMLInputElement>) => void;
};

const UploadArea: FC<Props> = ({ fileName, upload, onLoad }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Tooltip title='Upload file'>
        <Fab color='primary' sx={{ mr: 2 }} onClick={() => upload?.current?.click()}>
          <FileUploadIcon />
        </Fab>
      </Tooltip>
      {fileName ? <Typography>{fileName}</Typography> : <></>}
      <input ref={upload} style={{ display: 'none' }} type='file' onChange={onLoad} />
    </div>
  );
};

export default UploadArea;
