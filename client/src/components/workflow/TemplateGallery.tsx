/**
 * TEMPLATE GALLERY - Browse and use workflow templates
 * Provides search, filtering, and template instantiation
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Star, 
  Clock, 
  Users, 
  Play, 
  Eye, 
  Download,
  Grid,
  List,
  Tag,
  Sparkles,
  Zap,
  Settings,
  ArrowRight,
  ChevronDown,
  X,
  Check,
  AlertCircle,
  BookOpen,
  TrendingUp,
  Calendar,
  BarChart3
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ScrollArea } from '../ui/scroll-area';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: {
    id: string;
    name: string;
    icon: string;
    color: string;
  };
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  parameters: TemplateParameter[];
  sampleData: Record<string, any>;
  estimatedExecutionTime: string;
  popularityScore: number;
  usageCount: number;
  author: string;
  version: string;
  requirements: {
    connectors: string[];
    apiKeys?: string[];
  };
  documentation?: string;
}

interface TemplateParameter {
  id: string;
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'url' | 'email';
  defaultValue?: any;
  required: boolean;
  options?: Array<{ label: string; value: any }>;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  placeholder?: string;
  helpText?: string;
}

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  order: number;
}

interface TemplateGalleryProps {
  onTemplateSelect?: (templateId: string, parameters: Record<string, any>) => void;
  onClose?: () => void;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ 
  onTemplateSelect, 
  onClose 
}) => {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'popularity' | 'name' | 'created' | 'updated' | 'usage'>('popularity');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
  const [isInstantiating, setIsInstantiating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [previewMode, setPreviewMode] = useState<'overview' | 'parameters' | 'workflow'>('overview');

  // Load templates and categories
  useEffect(() => {
    loadTemplates();
    loadCategories();
  }, []);

  // Load initial parameter values when template is selected
  useEffect(() => {
    if (selectedTemplate) {
      const initialValues: Record<string, any> = {};
      selectedTemplate.parameters.forEach(param => {
        if (param.defaultValue !== undefined) {
          initialValues[param.id] = param.defaultValue;
        }
      });
      setParameterValues(initialValues);
    }
  }, [selectedTemplate]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/templates');
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch('/api/templates/categories');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  // Filter and sort templates
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(template => template.category.id === selectedCategory);
    }

    // Difficulty filter
    if (selectedDifficulty.length > 0) {
      filtered = filtered.filter(template => selectedDifficulty.includes(template.difficulty));
    }

    // Tags filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(template => 
        selectedTags.some(tag => template.tags.includes(tag))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'popularity':
          return b.popularityScore - a.popularityScore;
        case 'usage':
          return b.usageCount - a.usageCount;
        case 'created':
        case 'updated':
        default:
          return b.popularityScore - a.popularityScore; // Default to popularity
      }
    });

    return filtered;
  }, [templates, searchQuery, selectedCategory, selectedDifficulty, selectedTags, sortBy]);

  // Get unique tags from all templates
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    templates.forEach(template => {
      template.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [templates]);

  const handleInstantiateTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      setIsInstantiating(true);
      
      const response = await fetch('/api/templates/instantiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          parameters: parameterValues,
          customizations: {
            workflowName: `${selectedTemplate.name} - ${new Date().toLocaleDateString()}`
          }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        onTemplateSelect?.(selectedTemplate.id, parameterValues);
        setSelectedTemplate(null);
      } else {
        console.error('Template instantiation failed:', result.errors);
        // TODO: Show error toast
      }
    } catch (error) {
      console.error('Failed to instantiate template:', error);
    } finally {
      setIsInstantiating(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'text-green-600 bg-green-50 border-green-200';
      case 'intermediate': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'advanced': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const renderParameterInput = (parameter: TemplateParameter) => {
    const value = parameterValues[parameter.id] || '';

    switch (parameter.type) {
      case 'select':
        return (
          <Select value={value} onValueChange={(val) => setParameterValues(prev => ({ ...prev, [parameter.id]: val }))}>
            <SelectTrigger>
              <SelectValue placeholder={parameter.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {parameter.options?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multiselect':
        return (
          <div className="space-y-2">
            {parameter.options?.map(option => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`${parameter.id}-${option.value}`}
                  checked={Array.isArray(value) && value.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const currentValues = Array.isArray(value) ? value : [];
                    const newValues = checked 
                      ? [...currentValues, option.value]
                      : currentValues.filter(v => v !== option.value);
                    setParameterValues(prev => ({ ...prev, [parameter.id]: newValues }));
                  }}
                />
                <Label htmlFor={`${parameter.id}-${option.value}`} className="text-sm">
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => setParameterValues(prev => ({ ...prev, [parameter.id]: Number(e.target.value) }))}
            placeholder={parameter.placeholder}
            min={parameter.validation?.min}
            max={parameter.validation?.max}
          />
        );

      case 'boolean':
        return (
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => setParameterValues(prev => ({ ...prev, [parameter.id]: checked }))}
          />
        );

      case 'json':
        return (
          <Textarea
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setParameterValues(prev => ({ ...prev, [parameter.id]: parsed }));
              } catch {
                setParameterValues(prev => ({ ...prev, [parameter.id]: e.target.value }));
              }
            }}
            placeholder={parameter.placeholder || '{"key": "value"}'}
            className="font-mono text-sm"
            rows={4}
          />
        );

      default:
        return (
          <Input
            type={parameter.type === 'email' ? 'email' : parameter.type === 'url' ? 'url' : 'text'}
            value={value}
            onChange={(e) => setParameterValues(prev => ({ ...prev, [parameter.id]: e.target.value }))}
            placeholder={parameter.placeholder}
            minLength={parameter.validation?.minLength}
            maxLength={parameter.validation?.maxLength}
          />
        );
    }
  };

  const TemplateCard = ({ template }: { template: WorkflowTemplate }) => (
    <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-slate-200 hover:border-blue-300 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 flex-1">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-lg"
              style={{ backgroundColor: template.category.color }}
            >
              {template.category.icon}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg line-clamp-1 group-hover:text-blue-600 transition-colors">
                {template.name}
              </CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline" className={getDifficultyColor(template.difficulty)}>
                  {template.difficulty}
                </Badge>
                <Badge variant="outline" className="text-gray-500">
                  {template.category.name}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-sm text-gray-500">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span>{template.popularityScore}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <CardDescription className="line-clamp-2 text-gray-600">
          {template.description}
        </CardDescription>

        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100">
              {tag}
            </Badge>
          ))}
          {template.tags.length > 3 && (
            <Badge variant="secondary" className="text-xs bg-gray-50 text-gray-500">
              +{template.tags.length - 3}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>{template.estimatedExecutionTime}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>{template.usageCount.toLocaleString()}</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setSelectedTemplate(template)}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            <Eye className="w-4 h-4 mr-1" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const TemplateListItem = ({ template }: { template: WorkflowTemplate }) => (
    <Card className="group hover:shadow-md transition-all duration-200 cursor-pointer border-slate-200 hover:border-blue-300">
      <CardContent className="p-4">
        <div className="flex items-center space-x-4">
          <div 
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-semibold text-xl flex-shrink-0"
            style={{ backgroundColor: template.category.color }}
          >
            {template.category.icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-semibold text-lg group-hover:text-blue-600 transition-colors truncate">
                {template.name}
              </h3>
              <Badge variant="outline" className={getDifficultyColor(template.difficulty)}>
                {template.difficulty}
              </Badge>
            </div>
            <p className="text-gray-600 text-sm line-clamp-1 mb-2">{template.description}</p>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>{template.estimatedExecutionTime}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{template.usageCount.toLocaleString()}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span>{template.popularityScore}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSelectedTemplate(template)}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-2 rounded-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Template Gallery</h1>
              <p className="text-gray-600">Choose from pre-built workflows to get started quickly</p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category.id} value={category.id}>
                  <span className="flex items-center space-x-2">
                    <span>{category.icon}</span>
                    <span>{category.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popularity">Most Popular</SelectItem>
              <SelectItem value="usage">Most Used</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="created">Newest</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="w-8 h-8 p-0"
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="w-8 h-8 p-0"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>

          {/* Filters Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Difficulty Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Difficulty</Label>
                <div className="space-y-2">
                  {['beginner', 'intermediate', 'advanced'].map(difficulty => (
                    <div key={difficulty} className="flex items-center space-x-2">
                      <Checkbox
                        id={`difficulty-${difficulty}`}
                        checked={selectedDifficulty.includes(difficulty)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedDifficulty(prev => [...prev, difficulty]);
                          } else {
                            setSelectedDifficulty(prev => prev.filter(d => d !== difficulty));
                          }
                        }}
                      />
                      <Label htmlFor={`difficulty-${difficulty}`} className="text-sm capitalize">
                        {difficulty}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tags</Label>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {availableTags.slice(0, 10).map(tag => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tag-${tag}`}
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTags(prev => [...prev, tag]);
                          } else {
                            setSelectedTags(prev => prev.filter(t => t !== tag));
                          }
                        }}
                      />
                      <Label htmlFor={`tag-${tag}`} className="text-sm">
                        {tag}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDifficulty([]);
                    setSelectedTags([]);
                    setSelectedCategory('');
                    setSearchQuery('');
                  }}
                  className="w-full"
                >
                  Clear All Filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gray-300 rounded-lg" />
                        <div className="flex-1">
                          <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
                          <div className="h-3 bg-gray-300 rounded w-1/2" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-300 rounded" />
                        <div className="h-4 bg-gray-300 rounded w-4/5" />
                        <div className="flex space-x-2">
                          <div className="h-6 bg-gray-300 rounded w-16" />
                          <div className="h-6 bg-gray-300 rounded w-12" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                <div className="mb-6 flex items-center justify-between">
                  <p className="text-gray-600">
                    {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} found
                  </p>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTemplates.map(template => (
                      <TemplateCard key={template.id} template={template} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredTemplates.map(template => (
                      <TemplateListItem key={template.id} template={template} />
                    ))}
                  </div>
                )}

                {filteredTemplates.length === 0 && (
                  <div className="text-center py-12">
                    <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                    <p className="text-gray-600 mb-4">Try adjusting your search criteria or filters</p>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('');
                        setSelectedDifficulty([]);
                        setSelectedTags([]);
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Template Preview Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center space-x-3">
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-semibold text-xl"
                style={{ backgroundColor: selectedTemplate?.category.color }}
              >
                {selectedTemplate?.category.icon}
              </div>
              <div>
                <DialogTitle className="text-xl">{selectedTemplate?.name}</DialogTitle>
                <DialogDescription>{selectedTemplate?.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedTemplate && (
            <Tabs value={previewMode} onValueChange={(value: any) => setPreviewMode(value)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="parameters">Configure</TabsTrigger>
                <TabsTrigger value="workflow">Workflow</TabsTrigger>
              </TabsList>

              <div className="mt-4 max-h-96 overflow-y-auto">
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className={getDifficultyColor(selectedTemplate.difficulty)}>
                          {selectedTemplate.difficulty}
                        </Badge>
                        <Badge variant="outline">{selectedTemplate.category.name}</Badge>
                        <div className="flex items-center space-x-1 text-sm text-gray-500">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span>{selectedTemplate.popularityScore}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span>Estimated time: {selectedTemplate.estimatedExecutionTime}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-gray-500" />
                          <span>{selectedTemplate.usageCount.toLocaleString()} users</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="w-4 h-4 text-gray-500" />
                          <span>Version {selectedTemplate.version}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Required Connectors:</h4>
                        <div className="flex flex-wrap gap-1">
                          {selectedTemplate.requirements.connectors.map(connector => (
                            <Badge key={connector} variant="secondary" className="text-xs">
                              {connector}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Tags:</h4>
                        <div className="flex flex-wrap gap-1">
                          {selectedTemplate.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              <Tag className="w-3 h-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      {selectedTemplate.documentation && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">Documentation:</h4>
                          <p className="text-sm text-gray-600">{selectedTemplate.documentation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="parameters" className="space-y-4">
                  {selectedTemplate.parameters.length > 0 ? (
                    <div className="space-y-4">
                      {selectedTemplate.parameters.map(parameter => (
                        <div key={parameter.id} className="space-y-2">
                          <Label className="text-sm font-medium flex items-center space-x-2">
                            <span>{parameter.name}</span>
                            {parameter.required && (
                              <span className="text-red-500">*</span>
                            )}
                          </Label>
                          {parameter.description && (
                            <p className="text-sm text-gray-600">{parameter.description}</p>
                          )}
                          {renderParameterInput(parameter)}
                          {parameter.helpText && (
                            <p className="text-xs text-gray-500">{parameter.helpText}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600">This template doesn't require any configuration</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="workflow" className="space-y-4">
                  <div className="text-center py-8">
                    <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600">Workflow visualization coming soon</p>
                  </div>
                </TabsContent>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleInstantiateTemplate}
                  disabled={isInstantiating}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isInstantiating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Use This Template
                    </>
                  )}
                </Button>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateGallery;