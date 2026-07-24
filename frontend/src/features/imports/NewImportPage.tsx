import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, Typography } from '@mui/material';
import { UploadStep } from './UploadStep';
import { ReviewStep } from './ReviewStep';
import type { CommitResult, PreviewResult } from './schemas';

interface WizardState {
  step: 'upload' | 'review';
  preview?: PreviewResult;
  accountId?: string;
  filename?: string;
}

export function NewImportPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<WizardState>({ step: 'upload' });

  const onPreview = (
    result: PreviewResult,
    ctx: { accountId: string; filename: string },
  ) => {
    setState({ step: 'review', preview: result, ...ctx });
  };

  const onBack = () => {
    setState({ step: 'upload' });
  };

  const onCommitted = (_result: CommitResult) => {
    // Batch shows up at the top of /imports; going there is more useful than
    // staying on the wizard.
    navigate('/imports', { replace: true });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          Import CSV
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Two steps: pick an account and upload the file, then review the parsed rows before
          committing.
        </Typography>
      </Stack>

      {state.step === 'upload' && <UploadStep onPreview={onPreview} />}

      {state.step === 'review' && state.preview && state.filename && (
        <ReviewStep
          preview={state.preview}
          filename={state.filename}
          onBack={onBack}
          onCommitted={onCommitted}
        />
      )}
    </Stack>
  );
}
