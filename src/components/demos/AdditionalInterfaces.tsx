import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FolderCog, 
  FolderOpen, 
  FileText, 
  Image, 
  FileSpreadsheet, 
  CheckCircle,
  Code
} from "lucide-react";

export function DriveInterface({ data, highlights, loadingStates, completedActions }: any) {
  return (
    <div className="border rounded-lg bg-white shadow-lg overflow-hidden h-full">
      {/* Browser Header */}
      <div className="bg-gray-100 border-b px-4 py-2 flex items-center gap-2">
        <div className="flex gap-1">
          <div className="size-3 rounded-full bg-red-500"></div>
          <div className="size-3 rounded-full bg-yellow-500"></div>
          <div className="size-3 rounded-full bg-green-500"></div>
        </div>
        <div className="flex-1 mx-4">
          <div className="bg-white rounded-md px-3 py-1 text-sm border flex items-center gap-2">
            <div className="size-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600">Google Drive - File Organization</span>
          </div>
        </div>
      </div>
      
      {/* Drive Interface */}
      <div className="h-full bg-white">
        {/* Drive Header */}
        <div className="bg-blue-600 text-white px-6 py-3 flex items-center gap-4">
          <FolderCog className="size-6" />
          <span className="font-semibold text-lg">Google Drive</span>
          <span className="text-sm">My Drive</span>
        </div>
        
        {/* Drive Content */}
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 border-r p-4">
            <div className="space-y-2">
              <div className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                highlights.includes('inbox-folder') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}>
                <FolderOpen className="size-5" />
                <span className="font-medium">Inbox</span>
                {data.fileCount && (
                  <span className="ml-auto bg-blue-500 text-white text-xs px-2 py-1 rounded">{data.fileCount}</span>
                )}
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
                <FolderOpen className="size-5 text-gray-500" />
                <span className="text-gray-700">Documents</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
                <FolderOpen className="size-5 text-gray-500" />
                <span className="text-gray-700">Images</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
                <FolderOpen className="size-5 text-gray-500" />
                <span className="text-gray-700">Spreadsheets</span>
              </div>
            </div>
          </div>
          
          {/* File List */}
          <div className="flex-1 p-4">
            <div className="grid grid-cols-4 gap-4">
              {data.fileTypes?.map((type: string, index: number) => (
                <div key={index} className="border rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    {type === 'documents' && <FileText className="size-5 text-blue-500" />}
                    {type === 'images' && <Image className="size-5 text-green-500" />}
                    {type === 'spreadsheets' && <FileSpreadsheet className="size-5 text-green-600" />}
                    {type === 'presentations' && <FileText className="size-5 text-orange-500" />}
                    <span className="text-sm font-medium">{type}</span>
                  </div>
                  <div className="text-xs text-gray-500">Files being organized...</div>
                </div>
              ))}
            </div>
            
            {loadingStates.includes('file-scanning') && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                  Scanning files for organization...
                </div>
              </div>
            )}
            
            {completedActions.includes('file-movement') && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="size-4" />
                  Files organized successfully! 15 files moved to 4 folders.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocsInterface({ data, highlights, loadingStates, completedActions }: any) {
  return (
    <div className="border rounded-lg bg-white shadow-lg overflow-hidden h-full">
      {/* Browser Header */}
      <div className="bg-gray-100 border-b px-4 py-2 flex items-center gap-2">
        <div className="flex gap-1">
          <div className="size-3 rounded-full bg-red-500"></div>
          <div className="size-3 rounded-full bg-yellow-500"></div>
          <div className="size-3 rounded-full bg-green-500"></div>
        </div>
        <div className="flex-1 mx-4">
          <div className="bg-white rounded-md px-3 py-1 text-sm border flex items-center gap-2">
            <div className="size-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600">Google Docs - Report Generation</span>
          </div>
        </div>
      </div>
      
      {/* Docs Interface */}
      <div className="h-full bg-white">
        {/* Docs Header */}
        <div className="bg-blue-600 text-white px-6 py-3 flex items-center gap-4">
          <FileText className="size-6" />
          <span className="font-semibold text-lg">Google Docs</span>
          <span className="text-sm">Monthly Report Template</span>
        </div>
        
        {/* Document Content */}
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Monthly Performance Report</h1>
            
            <div className="space-y-6">
              <div className="border-b pb-4">
                <h2 className="text-xl font-semibold mb-3">Executive Summary</h2>
                <p className="text-gray-700">
                  This report provides a comprehensive overview of our monthly performance metrics and key achievements.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Revenue Overview</h3>
                  {data.reportData && (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total Revenue:</span>
                        <span className="font-semibold text-green-600">{data.reportData.totalRevenue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Growth Rate:</span>
                        <span className="font-semibold text-blue-600">{data.reportData.growthRate}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Top Products</h3>
                  {data.reportData?.topProducts && (
                    <ul className="space-y-1">
                      {data.reportData.topProducts.map((product: string, index: number) => (
                        <li key={index} className="text-sm">• {product}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              
              {loadingStates.includes('chart-generation') && (
                <div className="border rounded-lg p-4 bg-blue-50">
                  <div className="flex items-center gap-2 text-blue-700">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                    Generating charts and visualizations...
                  </div>
                </div>
              )}
              
              {completedActions.includes('chart-generation') && (
                <div className="border rounded-lg p-4 bg-green-50">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="size-4" />
                    Charts generated successfully!
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}