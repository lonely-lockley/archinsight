import React, { FC } from 'react';

import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { CircularProgress, Fab, Tooltip, Typography } from '@mui/material';

type Props = {
  fileName: string;
  loading: boolean | undefined;
  onDownload: () => void;
};

const DownloadArea: FC<Props> = ({ fileName, onDownload, loading }: Props) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {fileName ? <Typography>{fileName}</Typography> : <></>}
      <Tooltip title='Download file'>
        <Fab color='primary' disabled={!fileName || loading} sx={{ ml: 2 }} onClick={onDownload}>
          {loading ? <CircularProgress /> : <FileDownloadIcon />}
        </Fab>
      </Tooltip>
    </div>
  );
};

export default DownloadArea;
