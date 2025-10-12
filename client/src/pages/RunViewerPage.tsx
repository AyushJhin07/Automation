import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams } from "react-router-dom";

import { RunViewer } from "@/components/workflow/RunViewer";

const RunViewerPage = () => {
  const navigate = useNavigate();
  const { executionId } = useParams<{ executionId: string }>();

  useEffect(() => {
    if (!executionId) {
      navigate("/runs", { replace: true });
    }
  }, [executionId, navigate]);

  if (!executionId) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Run Viewer - Apps Script Studio</title>
      </Helmet>
      <RunViewer executionId={executionId} onClose={() => navigate("/runs")} />
    </>
  );
};

export default RunViewerPage;
