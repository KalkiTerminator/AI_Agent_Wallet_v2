import { useState } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Download, FileText, FileSpreadsheet, Image as ImageIcon, File, Code, 
  FileCode, Music, Video, Archive, FileType, BookOpen
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';

interface FileViewerProps {
  data: any;
  outputType?: string;
}

// File type categories
const CODE_FORMATS = ['javascript', 'typescript', 'python', 'java', 'cpp', 'css', 'html'];
const IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'tiff'];
const AUDIO_FORMATS = ['mp3', 'wav', 'ogg'];
const VIDEO_FORMATS = ['mp4', 'avi', 'mov'];
const ARCHIVE_FORMATS = ['zip', 'tar', 'gz', 'rar'];
const DOCUMENT_FORMATS = ['pdf', 'doc', 'odt', 'rtf'];
const PRESENTATION_FORMATS = ['ppt', 'odp'];

// Enhanced file type detection
const detectFileType = (data: any, outputType?: string): string => {
  if (!data) return "text";
  
  // If explicit output type is provided and not 'smart', use it
  if (outputType && outputType !== "smart") {
    return outputType;
  }
  
  // Check for base64 data URIs
  if (typeof data === "string" && data.startsWith("data:")) {
    if (data.startsWith("data:image/")) return "image";
    if (data.startsWith("data:audio/")) return "audio";
    if (data.startsWith("data:video/")) return "video";
    if (data.startsWith("data:application/pdf")) return "pdf";
  }
  
  // Check for URL patterns
  if (typeof data === "string") {
    const lowerData = data.toLowerCase();
    
    // Images
    if (lowerData.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/)) return "image";
    
    // Audio
    if (lowerData.match(/\.(mp3|wav|ogg)$/)) return "audio";
    
    // Video
    if (lowerData.match(/\.(mp4|avi|mov)$/)) return "video";
    
    // Documents
    if (lowerData.match(/\.(pdf)$/)) return "pdf";
    if (lowerData.match(/\.(doc|docx|odt)$/)) return "doc";
    if (lowerData.match(/\.(rtf)$/)) return "rtf";
    
    // Data formats
    if (lowerData.match(/\.(csv)$/)) return "csv";
    if (lowerData.match(/\.(tsv)$/)) return "tsv";
    if (lowerData.match(/\.(xlsx|xls)$/)) return "excel";
    if (lowerData.match(/\.(json)$/)) return "json";
    if (lowerData.match(/\.(xml)$/)) return "xml";
    if (lowerData.match(/\.(yaml|yml)$/)) return "yaml";
    
    // Code files
    if (lowerData.match(/\.(js)$/)) return "javascript";
    if (lowerData.match(/\.(ts)$/)) return "typescript";
    if (lowerData.match(/\.(py)$/)) return "python";
    if (lowerData.match(/\.(java)$/)) return "java";
    if (lowerData.match(/\.(cpp|c\+\+|cc)$/)) return "cpp";
    if (lowerData.match(/\.(css)$/)) return "css";
    if (lowerData.match(/\.(html|htm)$/)) return "html";
    
    // Archives
    if (lowerData.match(/\.(zip|tar|gz|rar)$/)) return "archive";
    
    // Presentations
    if (lowerData.match(/\.(ppt|pptx|odp)$/)) return "presentation";
    
    // Other
    if (lowerData.match(/\.(epub)$/)) return "epub";
    if (lowerData.match(/\.(md|markdown)$/)) return "markdown";
    
    // Check content patterns for markdown
    if (data.match(/^#+\s+.+/m) || data.match(/\[.+\]\(.+\)/)) return "markdown";
    
    // Check for XML content
    if (data.trim().startsWith("<?xml") || data.trim().startsWith("<")) return "xml";
    
    // Check for JSON content
    try {
      if (data.trim().startsWith("{") || data.trim().startsWith("[")) {
        JSON.parse(data);
        return "json";
      }
    } catch (e) {
      // Not valid JSON
    }
  }
  
  // Check for structured data
  if (typeof data === "object") {
    // Check if it's CSV-like (array of objects)
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
      return "csv";
    }
    return "json";
  }
  
  return "text";
};

// Parse CSV/TSV data
const parseDelimitedData = (dataString: string, delimiter: string = ","): any[] => {
  const lines = dataString.trim().split("\n");
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim());
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || "";
    });
    return obj;
  });
  
  return rows;
};

// Get MIME type for download
const getMimeType = (fileType: string): string => {
  const mimeTypes: Record<string, string> = {
    // Text & Documents
    text: "text/plain",
    markdown: "text/markdown",
    rtf: "application/rtf",
    doc: "application/msword",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf",
    
    // Data Formats
    json: "application/json",
    xml: "application/xml",
    yaml: "application/x-yaml",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    
    // Web & Code
    html: "text/html",
    css: "text/css",
    javascript: "text/javascript",
    typescript: "text/typescript",
    python: "text/x-python",
    java: "text/x-java",
    cpp: "text/x-c++src",
    
    // Media
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    
    // Archives
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    rar: "application/x-rar-compressed",
    
    // Presentations
    ppt: "application/vnd.ms-powerpoint",
    odp: "application/vnd.oasis.opendocument.presentation",
    
    // Other
    epub: "application/epub+zip",
    binary: "application/octet-stream",
    file: "application/octet-stream",
  };
  
  return mimeTypes[fileType] || "application/octet-stream";
};

// Get file extension for download
const getFileExtension = (fileType: string): string => {
  const extensions: Record<string, string> = {
    jpeg: "jpg",
    cpp: "cpp",
  };
  
  return extensions[fileType] || fileType;
};

export const FileViewer = ({ data, outputType = "smart" }: FileViewerProps) => {
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");
  
  // Determine actual file type
  const detectedType = detectFileType(data, outputType);
  
  // Handle download
  const handleDownload = () => {
    let blob: Blob;
    let filename: string;
    const mimeType = getMimeType(detectedType);
    const extension = getFileExtension(detectedType);
    
    // Handle base64 data URIs
    if (typeof data === "string" && data.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = data;
      link.download = `output.${extension}`;
      link.click();
      return;
    }
    
    // Handle different data types
    switch (detectedType) {
      case "csv":
        const csvData = typeof data === "string" ? data : 
                       Array.isArray(data) ? convertToDelimited(data, ",") : JSON.stringify(data);
        blob = new Blob([csvData], { type: mimeType });
        filename = `output.${extension}`;
        break;
        
      case "tsv":
        const tsvData = typeof data === "string" ? data : 
                       Array.isArray(data) ? convertToDelimited(data, "\t") : JSON.stringify(data);
        blob = new Blob([tsvData], { type: mimeType });
        filename = `output.${extension}`;
        break;
        
      case "json":
        blob = new Blob([JSON.stringify(data, null, 2)], { type: mimeType });
        filename = `output.${extension}`;
        break;
        
      default:
        const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        blob = new Blob([content], { type: mimeType });
        filename = `output.${extension}`;
    }
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  
  // Convert array of objects to delimited string
  const convertToDelimited = (arr: any[], delimiter: string = ","): string => {
    if (!arr.length) return "";
    const headers = Object.keys(arr[0]);
    const rows = [
      headers.join(delimiter),
      ...arr.map(row => headers.map(h => JSON.stringify(row[h] || "")).join(delimiter))
    ];
    return rows.join("\n");
  };
  
  // Render based on file type
  const renderPreview = () => {
    // Images
    if (IMAGE_FORMATS.includes(detectedType) || detectedType === "image") {
      return (
        <div className="flex items-center justify-center p-8 bg-muted/30 rounded-lg">
          <img 
            src={data} 
            alt="Output" 
            className="max-w-full max-h-[500px] object-contain rounded-lg shadow-lg"
          />
        </div>
      );
    }
    
    // Code formats
    if (CODE_FORMATS.includes(detectedType)) {
      return (
        <div className="rounded-lg overflow-hidden">
          <SyntaxHighlighter 
            language={detectedType === 'cpp' ? 'cpp' : detectedType}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
            }}
            showLineNumbers
          >
            {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
          </SyntaxHighlighter>
        </div>
      );
    }
    
    // Markdown
    if (detectedType === "markdown") {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 p-6 rounded-lg">
          <ReactMarkdown>{typeof data === "string" ? data : JSON.stringify(data)}</ReactMarkdown>
        </div>
      );
    }
    
    // CSV/TSV
    if (detectedType === "csv" || detectedType === "tsv") {
      const delimiter = detectedType === "tsv" ? "\t" : ",";
      const tableData = typeof data === "string" ? parseDelimitedData(data, delimiter) : data;
      
      if (!Array.isArray(tableData) || tableData.length === 0) {
        return <div className="text-muted-foreground">No data to display</div>;
      }
      
      const headers = Object.keys(tableData[0]);
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted">
                {headers.map((header, i) => (
                  <th key={i} className="border border-border px-4 py-2 text-left font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className="hover:bg-muted/50">
                  {headers.map((header, j) => (
                    <td key={j} className="border border-border px-4 py-2">
                      {row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    
    // JSON
    if (detectedType === "json") {
      return (
        <div className="rounded-lg overflow-hidden">
          <SyntaxHighlighter 
            language="json"
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
            }}
            showLineNumbers
          >
            {JSON.stringify(data, null, 2)}
          </SyntaxHighlighter>
        </div>
      );
    }
    
    // XML/YAML
    if (detectedType === "xml" || detectedType === "yaml") {
      return (
        <div className="rounded-lg overflow-hidden">
          <SyntaxHighlighter 
            language={detectedType}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
            }}
            showLineNumbers
          >
            {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
          </SyntaxHighlighter>
        </div>
      );
    }
    
    // HTML
    if (detectedType === "html") {
      const sanitizedHTML = DOMPurify.sanitize(data, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'span', 'div', 'pre', 'code', 'blockquote', 'hr'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
      });
      return (
        <div className="space-y-4">
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
            <p className="text-sm text-warning-foreground">
              HTML preview - rendered content shown below (sanitized)
            </p>
          </div>
          <div 
            className="bg-background border border-border rounded-lg p-4"
            dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
          />
        </div>
      );
    }
    
    // Audio
    if (AUDIO_FORMATS.includes(detectedType)) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg space-y-4">
          <Music className="h-16 w-16 text-muted-foreground" />
          <audio controls className="w-full max-w-md">
            <source src={data} type={getMimeType(detectedType)} />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }
    
    // Video
    if (VIDEO_FORMATS.includes(detectedType)) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg">
          <video controls className="w-full max-w-2xl rounded-lg shadow-lg">
            <source src={data} type={getMimeType(detectedType)} />
            Your browser does not support the video element.
          </video>
        </div>
      );
    }
    
    // Archives
    if (ARCHIVE_FORMATS.includes(detectedType) || detectedType === "archive") {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <Archive className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Archive file - download to extract</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Archive
          </Button>
        </div>
      );
    }
    
    // Documents (PDF, DOC, etc.)
    if (DOCUMENT_FORMATS.includes(detectedType)) {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            {detectedType.toUpperCase()} document - download to view
          </p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download {detectedType.toUpperCase()}
          </Button>
        </div>
      );
    }
    
    // Presentations
    if (PRESENTATION_FORMATS.includes(detectedType) || detectedType === "presentation") {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <FileType className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Presentation file - download to view</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Presentation
          </Button>
        </div>
      );
    }
    
    // EPUB
    if (detectedType === "epub") {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">EPUB book - download to read</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download EPUB
          </Button>
        </div>
      );
    }
    
    // Excel
    if (detectedType === "excel") {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Excel file - download to view</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Excel File
          </Button>
        </div>
      );
    }
    
    // RTF
    if (detectedType === "rtf") {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">RTF document - download to view</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download RTF
          </Button>
        </div>
      );
    }
    
    // Binary/Generic files
    if (detectedType === "binary" || detectedType === "file") {
      return (
        <div className="text-center p-8 bg-muted/30 rounded-lg">
          <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Binary file - download to use</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download File
          </Button>
        </div>
      );
    }
    
    // Default: Plain text
    return (
      <div className="bg-muted/30 p-4 rounded-lg">
        <pre className="whitespace-pre-wrap text-sm font-mono">
          {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };
  
  // Get icon for file type
  const getFileIcon = () => {
    if (IMAGE_FORMATS.includes(detectedType) || detectedType === "image") {
      return <ImageIcon className="h-4 w-4" />;
    }
    if (CODE_FORMATS.includes(detectedType)) {
      return <FileCode className="h-4 w-4" />;
    }
    if (AUDIO_FORMATS.includes(detectedType)) {
      return <Music className="h-4 w-4" />;
    }
    if (VIDEO_FORMATS.includes(detectedType)) {
      return <Video className="h-4 w-4" />;
    }
    if (ARCHIVE_FORMATS.includes(detectedType) || detectedType === "archive") {
      return <Archive className="h-4 w-4" />;
    }
    if (detectedType === "csv" || detectedType === "tsv" || detectedType === "excel") {
      return <FileSpreadsheet className="h-4 w-4" />;
    }
    if (detectedType === "json" || detectedType === "xml" || detectedType === "yaml") {
      return <Code className="h-4 w-4" />;
    }
    if (detectedType === "markdown") {
      return <FileText className="h-4 w-4" />;
    }
    if (detectedType === "epub") {
      return <BookOpen className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };
  
  return (
    <Card className="border-success/20 bg-success/5">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              {getFileIcon()}
              {detectedType.toUpperCase()}
            </Badge>
            {outputType === "smart" && (
              <Badge variant="secondary">Auto-detected</Badge>
            )}
          </div>
          <Button onClick={handleDownload} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "raw")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="raw">Raw Data</TabsTrigger>
          </TabsList>
          
          <TabsContent value="preview" className="mt-4">
            {renderPreview()}
          </TabsContent>
          
          <TabsContent value="raw" className="mt-4">
            <pre className="bg-muted/30 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px] overflow-y-auto font-mono">
              {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
