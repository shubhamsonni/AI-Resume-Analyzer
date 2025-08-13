import { useState, type FormEvent } from "react";
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import { usePuterStore } from "~/lib/puter";
import { useNavigate } from "react-router";
import { convertPdfToImage } from "~/lib/pdf2img";
import { generateUUID } from "~/lib/utils";
import { prepareInstructions } from "~/constants";

const Upload = () => {
  const { fs, ai, kv } = usePuterStore();
  const navigate = useNavigate();

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File | null) => setFile(file);

  const withTimeout = async <T,>(
    promise: Promise<T>,
    ms: number
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Analysis timed out")),
        ms
      );
      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const handleAnalyze = async ({
    companyName,
    jobTitle,
    jobDescription,
    file,
  }: {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    file: File;
  }) => {
    try {
      setIsProcessing(true);
      setError(null);

      setStatusText("Uploading resume...");
      const uploadedFile = await fs.upload([file]);
      if (!uploadedFile) throw new Error("Failed to upload resume");

      setStatusText("Converting PDF to image...");
      const imageFile = await convertPdfToImage(file);
      if (!imageFile.file) throw new Error("PDF to image conversion failed");

      setStatusText("Uploading image...");
      const uploadedImage = await fs.upload([imageFile.file]);
      if (!uploadedImage) throw new Error("Failed to upload image");

      setStatusText("Saving data...");
      const uuid = generateUUID();
      const data = {
        id: uuid,
        resumePath: uploadedFile.path,
        imagePath: uploadedImage.path,
        companyName,
        jobTitle,
        jobDescription,
        feedback: "",
      };
      await kv.set(`resume:${uuid}`, JSON.stringify(data));

      setStatusText("Analyzing resume...");
      const feedback = await withTimeout(
        ai.feedback(
          uploadedFile.path,
          prepareInstructions({ jobTitle, jobDescription })
        ),
        30000 // 30 sec timeout
      );

      if (!feedback) throw new Error("No feedback from AI");

      const feedbackText =
        typeof feedback.message.content === "string"
          ? feedback.message.content
          : feedback.message.content[0]?.text || "{}";

      data.feedback = JSON.parse(feedbackText);
      await kv.set(`resume:${uuid}`, JSON.stringify(data));

      setStatusText("Analysis complete! Redirecting...");
      navigate(`/resume/${uuid}`);
    } catch (err) {
      console.error("Analysis error:", err);
      setError((err as Error).message);
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setError("Please upload a file before analyzing");
      return;
    }
    const formData = new FormData(e.currentTarget);
    handleAnalyze({
      companyName: formData.get("company-name") as string,
      jobTitle: formData.get("job-title") as string,
      jobDescription: formData.get("job-description") as string,
      file,
    });
  };

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
      <Navbar />
      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Smart feedback for your dream job</h1>

          {isProcessing ? (
            <>
              <h2>{statusText}</h2>
              <img src="/images/resume-scan.gif" className="w-full" />
            </>
          ) : error ? (
            <div className="text-red-500">
              <p>Error: {error}</p>
              <button
                className="primary-button mt-4"
                onClick={() => setError(null)}
              >
                Try Again
              </button>
            </div>
          ) : (
            <h2>Drop your resume for an ATS score and improvement tips</h2>
          )}

          {!isProcessing && !error && (
            <form
              id="upload-form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 mt-8"
            >
              <div className="form-div">
                <label htmlFor="company-name">Company Name</label>
                <input
                  type="text"
                  name="company-name"
                  placeholder="Company Name"
                  id="company-name"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-title">Job Title</label>
                <input
                  type="text"
                  name="job-title"
                  placeholder="Job Title"
                  id="job-title"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-description">Job Description</label>
                <textarea
                  rows={5}
                  name="job-description"
                  placeholder="Job Description"
                  id="job-description"
                />
              </div>
              <div className="form-div">
                <label htmlFor="uploader">Upload Resume</label>
                <FileUploader onFileSelect={handleFileSelect} />
              </div>
              <button className="primary-button w-full" type="submit">
                Analyze Resume
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};

export default Upload;
