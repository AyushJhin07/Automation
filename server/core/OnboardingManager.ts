/**
 * GUIDED USER ONBOARDING MANAGER
 * Provides interactive tutorials, progress tracking, and personalized onboarding flows
 */

export interface OnboardingProfile {
  userId: string;
  userType: UserType;
  experience: ExperienceLevel;
  goals: UserGoal[];
  industry?: string;
  teamSize?: TeamSize;
  useCases: string[];
  preferences: {
    learningStyle: LearningStyle;
    notifications: boolean;
    assistantGuidance: boolean;
    quickStart: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type UserType = 'individual' | 'team_lead' | 'developer' | 'business_user' | 'admin';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type UserGoal = 'automate_tasks' | 'integrate_systems' | 'ai_workflows' | 'data_processing' | 'team_collaboration';
export type TeamSize = 'solo' | 'small' | 'medium' | 'large' | 'enterprise';
export type LearningStyle = 'hands_on' | 'guided' | 'exploration' | 'documentation';

export interface OnboardingFlow {
  id: string;
  name: string;
  description: string;
  targetUserTypes: UserType[];
  targetExperience: ExperienceLevel[];
  targetGoals: UserGoal[];
  estimatedDuration: number; // minutes
  difficulty: 'easy' | 'medium' | 'hard';
  steps: OnboardingStep[];
  prerequisites?: string[];
  outcomes: string[];
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingStep {
  id: string;
  type: StepType;
  title: string;
  description: string;
  content: StepContent;
  validation?: StepValidation;
  hints: string[];
  estimatedTime: number; // minutes
  isOptional: boolean;
  order: number;
}

export type StepType = 
  | 'welcome' | 'tutorial' | 'hands_on' | 'quiz' | 'setup' 
  | 'create_workflow' | 'connect_app' | 'test_execution' 
  | 'explore_feature' | 'completion';

export interface StepContent {
  text?: string;
  video?: string;
  interactive?: InteractiveContent;
  links?: Array<{ title: string; url: string; external?: boolean }>;
  checklist?: Array<{ item: string; completed: boolean }>;
  codeExample?: string;
  tips?: string[];
}

export interface InteractiveContent {
  type: 'tour' | 'form' | 'workflow_builder' | 'connector_setup' | 'demo';
  config: Record<string, any>;
  targetElements?: string[]; // CSS selectors for guided tours
  actions?: Array<{
    trigger: string;
    action: string;
    target?: string;
  }>;
}

export interface StepValidation {
  type: 'completion' | 'creation' | 'connection' | 'execution' | 'quiz_score';
  criteria: Record<string, any>;
  autoCheck: boolean;
  manualOverride: boolean;
}

export interface UserProgress {
  userId: string;
  flowId: string;
  currentStep: number;
  completedSteps: string[];
  skippedSteps: string[];
  startedAt: Date;
  lastActiveAt: Date;
  completedAt?: Date;
  status: ProgressStatus;
  timeSpent: number; // minutes
  achievements: Achievement[];
  feedback?: {
    rating: number;
    comments: string;
    suggestions: string[];
  };
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  unlockedAt: Date;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

export type AchievementCategory = 'onboarding' | 'workflow' | 'integration' | 'ai' | 'collaboration' | 'expert';

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: TutorialCategory;
  difficulty: ExperienceLevel;
  duration: number; // minutes
  prerequisites: string[];
  learningObjectives: string[];
  content: TutorialContent;
  exercises: Exercise[];
  resources: Resource[];
  isInteractive: boolean;
  tags: string[];
  rating: number;
  completionRate: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TutorialCategory = 
  | 'getting_started' | 'workflow_building' | 'connectors' | 'ai_features' 
  | 'data_mapping' | 'templates' | 'troubleshooting' | 'advanced_features';

export interface TutorialContent {
  sections: TutorialSection[];
  totalSteps: number;
  hasVideo: boolean;
  hasInteractive: boolean;
  hasQuiz: boolean;
}

export interface TutorialSection {
  id: string;
  title: string;
  content: string;
  mediaType?: 'text' | 'video' | 'interactive' | 'image';
  mediaUrl?: string;
  interactiveDemo?: InteractiveContent;
  keyPoints: string[];
  duration: number;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  type: 'practice' | 'challenge' | 'project';
  instructions: string[];
  expectedOutcome: string;
  validation: ExerciseValidation;
  hints: string[];
  solution?: string;
}

export interface ExerciseValidation {
  type: 'automatic' | 'manual' | 'self_assessment';
  criteria: string[];
  successMessage: string;
  failureMessage: string;
}

export interface Resource {
  id: string;
  title: string;
  type: 'documentation' | 'video' | 'template' | 'example' | 'tool';
  url: string;
  description: string;
  isExternal: boolean;
}

export interface OnboardingRecommendation {
  userId: string;
  flowId: string;
  reason: RecommendationReason;
  confidence: number; // 0-1
  personalizedMessage: string;
  estimatedValue: string;
  prerequisites: string[];
  nextSteps: string[];
  generatedAt: Date;
}

export type RecommendationReason = 
  | 'profile_match' | 'goal_alignment' | 'skill_gap' | 'feature_discovery' 
  | 'workflow_completion' | 'team_collaboration' | 'ai_adoption';

class OnboardingManager {
  private profiles = new Map<string, OnboardingProfile>();
  private flows = new Map<string, OnboardingFlow>();
  private tutorials = new Map<string, Tutorial>();
  private userProgress = new Map<string, UserProgress[]>();
  private achievements = new Map<string, Achievement[]>();

  constructor() {
    this.initializeDefaultFlows();
    this.initializeTutorials();
    this.initializeAchievements();
    console.log('🎓 Guided Onboarding Manager initialized');
  }

  /**
   * Create or update user onboarding profile
   */
  createProfile(data: {
    userId: string;
    userType: UserType;
    experience: ExperienceLevel;
    goals: UserGoal[];
    industry?: string;
    teamSize?: TeamSize;
    useCases: string[];
    preferences: OnboardingProfile['preferences'];
  }): OnboardingProfile {
    const existingProfile = this.profiles.get(data.userId);
    
    const profile: OnboardingProfile = {
      ...data,
      createdAt: existingProfile?.createdAt || new Date(),
      updatedAt: new Date()
    };

    this.profiles.set(data.userId, profile);
    
    // Generate personalized recommendations
    this.generateRecommendations(data.userId);
    
    console.log(`🎓 Created onboarding profile for user ${data.userId}`);
    return profile;
  }

  /**
   * Get personalized onboarding recommendations
   */
  getRecommendations(userId: string): OnboardingRecommendation[] {
    const profile = this.profiles.get(userId);
    if (!profile) {
      return this.getDefaultRecommendations(userId);
    }

    const recommendations: OnboardingRecommendation[] = [];
    const userProgress = this.getUserProgress(userId);
    const completedFlows = userProgress.filter(p => p.status === 'completed').map(p => p.flowId);

    // Find matching flows
    for (const flow of this.flows.values()) {
      if (completedFlows.includes(flow.id)) continue;
      
      const score = this.calculateFlowRelevance(profile, flow);
      if (score > 0.6) {
        recommendations.push({
          userId,
          flowId: flow.id,
          reason: this.determineRecommendationReason(profile, flow),
          confidence: score,
          personalizedMessage: this.generatePersonalizedMessage(profile, flow),
          estimatedValue: this.calculateEstimatedValue(profile, flow),
          prerequisites: flow.prerequisites || [],
          nextSteps: this.generateNextSteps(profile, flow),
          generatedAt: new Date()
        });
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * Start an onboarding flow for a user
   */
  startFlow(userId: string, flowId: string): UserProgress {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Onboarding flow ${flowId} not found`);
    }

    const existingProgress = this.getUserProgress(userId).find(p => p.flowId === flowId);
    if (existingProgress && existingProgress.status !== 'abandoned') {
      return existingProgress;
    }

    const progress: UserProgress = {
      userId,
      flowId,
      currentStep: 0,
      completedSteps: [],
      skippedSteps: [],
      startedAt: new Date(),
      lastActiveAt: new Date(),
      status: 'in_progress',
      timeSpent: 0,
      achievements: []
    };

    const userProgressList = this.userProgress.get(userId) || [];
    userProgressList.push(progress);
    this.userProgress.set(userId, userProgressList);

    console.log(`🎓 Started onboarding flow ${flowId} for user ${userId}`);
    return progress;
  }

  /**
   * Complete a step in an onboarding flow
   */
  completeStep(userId: string, flowId: string, stepId: string, data?: any): {
    progress: UserProgress;
    nextStep?: OnboardingStep;
    achievements: Achievement[];
  } {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Onboarding flow ${flowId} not found`);
    }

    const progress = this.getUserProgress(userId).find(p => p.flowId === flowId);
    if (!progress) {
      throw new Error(`No progress found for flow ${flowId} and user ${userId}`);
    }

    const step = flow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in flow ${flowId}`);
    }

    // Validate step completion if required
    if (step.validation && !this.validateStepCompletion(step, data)) {
      throw new Error(`Step ${stepId} validation failed`);
    }

    // Update progress
    if (!progress.completedSteps.includes(stepId)) {
      progress.completedSteps.push(stepId);
    }
    
    progress.currentStep = Math.max(progress.currentStep, step.order + 1);
    progress.lastActiveAt = new Date();
    progress.status = progress.currentStep >= flow.steps.length ? 'completed' : 'in_progress';
    
    if (progress.status === 'completed') {
      progress.completedAt = new Date();
    }

    // Check for achievements
    const newAchievements = this.checkAchievements(userId, flowId, stepId);
    progress.achievements.push(...newAchievements);

    // Update user progress
    const userProgressList = this.userProgress.get(userId) || [];
    const progressIndex = userProgressList.findIndex(p => p.flowId === flowId);
    if (progressIndex >= 0) {
      userProgressList[progressIndex] = progress;
      this.userProgress.set(userId, userProgressList);
    }

    // Find next step
    const nextStep = flow.steps.find(s => s.order === progress.currentStep);

    console.log(`✅ Completed step ${stepId} for user ${userId} in flow ${flowId}`);
    
    return {
      progress,
      nextStep,
      achievements: newAchievements
    };
  }

  /**
   * Skip a step in an onboarding flow
   */
  skipStep(userId: string, flowId: string, stepId: string): UserProgress {
    const progress = this.getUserProgress(userId).find(p => p.flowId === flowId);
    if (!progress) {
      throw new Error(`No progress found for flow ${flowId} and user ${userId}`);
    }

    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Onboarding flow ${flowId} not found`);
    }

    const step = flow.steps.find(s => s.id === stepId);
    if (!step || !step.isOptional) {
      throw new Error(`Step ${stepId} cannot be skipped`);
    }

    progress.skippedSteps.push(stepId);
    progress.currentStep = Math.max(progress.currentStep, step.order + 1);
    progress.lastActiveAt = new Date();

    const userProgressList = this.userProgress.get(userId) || [];
    const progressIndex = userProgressList.findIndex(p => p.flowId === flowId);
    if (progressIndex >= 0) {
      userProgressList[progressIndex] = progress;
      this.userProgress.set(userId, userProgressList);
    }

    return progress;
  }

  /**
   * Get user's progress across all flows
   */
  getUserProgress(userId: string): UserProgress[] {
    return this.userProgress.get(userId) || [];
  }

  /**
   * Get available tutorials
   */
  getTutorials(filters?: {
    category?: TutorialCategory;
    difficulty?: ExperienceLevel;
    tag?: string;
    userId?: string;
  }): Tutorial[] {
    let tutorials = Array.from(this.tutorials.values());

    if (filters?.category) {
      tutorials = tutorials.filter(t => t.category === filters.category);
    }

    if (filters?.difficulty) {
      tutorials = tutorials.filter(t => t.difficulty === filters.difficulty);
    }

    if (filters?.tag) {
      tutorials = tutorials.filter(t => t.tags.includes(filters.tag));
    }

    // Personalize based on user profile
    if (filters?.userId) {
      const profile = this.profiles.get(filters.userId);
      if (profile) {
        tutorials = this.personalizetutorials(tutorials, profile);
      }
    }

    return tutorials.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Get onboarding analytics
   */
  getAnalytics(): {
    overview: {
      totalUsers: number;
      activeFlows: number;
      completionRate: number;
      averageTimeToComplete: number;
      mostPopularFlow: string;
    };
    flowAnalytics: Array<{
      flowId: string;
      name: string;
      startedCount: number;
      completedCount: number;
      completionRate: number;
      averageTime: number;
      dropoffPoints: Array<{ stepId: string; dropoffRate: number }>;
    }>;
    userSegments: Array<{
      segment: string;
      count: number;
      completionRate: number;
      preferredFlows: string[];
    }>;
    achievements: Array<{
      achievementId: string;
      unlockedCount: number;
      rarity: Achievement['rarity'];
    }>;
  } {
    const allProgress = Array.from(this.userProgress.values()).flat();
    const allProfiles = Array.from(this.profiles.values());

    // Overview metrics
    const totalUsers = allProfiles.length;
    const activeFlows = allProgress.filter(p => p.status === 'in_progress').length;
    const completedFlows = allProgress.filter(p => p.status === 'completed');
    const completionRate = allProgress.length > 0 ? (completedFlows.length / allProgress.length) * 100 : 0;
    
    const averageTimeToComplete = completedFlows.length > 0 ?
      completedFlows.reduce((sum, p) => sum + p.timeSpent, 0) / completedFlows.length : 0;

    // Most popular flow
    const flowCounts: Record<string, number> = {};
    allProgress.forEach(p => {
      flowCounts[p.flowId] = (flowCounts[p.flowId] || 0) + 1;
    });
    const mostPopularFlow = Object.entries(flowCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || '';

    // Flow analytics
    const flowAnalytics = Array.from(this.flows.values()).map(flow => {
      const flowProgress = allProgress.filter(p => p.flowId === flow.id);
      const completedFlowProgress = flowProgress.filter(p => p.status === 'completed');
      
      return {
        flowId: flow.id,
        name: flow.name,
        startedCount: flowProgress.length,
        completedCount: completedFlowProgress.length,
        completionRate: flowProgress.length > 0 ? (completedFlowProgress.length / flowProgress.length) * 100 : 0,
        averageTime: completedFlowProgress.length > 0 ?
          completedFlowProgress.reduce((sum, p) => sum + p.timeSpent, 0) / completedFlowProgress.length : 0,
        dropoffPoints: this.calculateDropoffPoints(flow, flowProgress)
      };
    });

    // User segments
    const userSegments = this.calculateUserSegments(allProfiles, allProgress);

    // Achievements
    const allAchievements = Array.from(this.achievements.values()).flat();
    const achievementCounts: Record<string, { count: number; rarity: Achievement['rarity'] }> = {};
    allAchievements.forEach(achievement => {
      if (!achievementCounts[achievement.id]) {
        achievementCounts[achievement.id] = { count: 0, rarity: achievement.rarity };
      }
      achievementCounts[achievement.id].count++;
    });

    const achievements = Object.entries(achievementCounts).map(([achievementId, data]) => ({
      achievementId,
      unlockedCount: data.count,
      rarity: data.rarity
    }));

    return {
      overview: {
        totalUsers,
        activeFlows,
        completionRate,
        averageTimeToComplete,
        mostPopularFlow
      },
      flowAnalytics,
      userSegments,
      achievements
    };
  }

  // Private helper methods

  private initializeDefaultFlows(): void {
    const flows: Omit<OnboardingFlow, 'createdAt' | 'updatedAt'>[] = [
      {
        id: 'quick_start',
        name: 'Quick Start Guide',
        description: 'Get up and running with your first workflow in under 10 minutes',
        targetUserTypes: ['individual', 'business_user'],
        targetExperience: ['beginner'],
        targetGoals: ['automate_tasks'],
        estimatedDuration: 10,
        difficulty: 'easy',
        steps: [
          {
            id: 'welcome',
            type: 'welcome',
            title: 'Welcome to Workflow Automation!',
            description: 'Learn the basics of creating powerful automations',
            content: {
              text: 'Welcome! In the next 10 minutes, you\'ll create your first automated workflow.',
              tips: ['No coding required', 'Start with simple automations', 'Build complexity over time']
            },
            hints: ['Take your time to explore', 'Ask for help if needed'],
            estimatedTime: 1,
            isOptional: false,
            order: 0
          },
          {
            id: 'create_first_workflow',
            type: 'hands_on',
            title: 'Create Your First Workflow',
            description: 'Build a simple automation from a template',
            content: {
              interactive: {
                type: 'workflow_builder',
                config: { template: 'email_to_slack' },
                actions: [
                  { trigger: 'template_select', action: 'highlight', target: '.template-gallery' },
                  { trigger: 'node_add', action: 'guide', target: '.workflow-canvas' }
                ]
              }
            },
            validation: {
              type: 'creation',
              criteria: { workflowCreated: true },
              autoCheck: true,
              manualOverride: true
            },
            hints: ['Use the template gallery', 'Drag and drop nodes'],
            estimatedTime: 5,
            isOptional: false,
            order: 1
          },
          {
            id: 'test_workflow',
            type: 'test_execution',
            title: 'Test Your Workflow',
            description: 'Run your workflow to see it in action',
            content: {
              text: 'Now let\'s test your workflow to make sure it works correctly.',
              checklist: [
                { item: 'Click the Test button', completed: false },
                { item: 'Review the execution results', completed: false },
                { item: 'Check that data flows correctly', completed: false }
              ]
            },
            validation: {
              type: 'execution',
              criteria: { workflowExecuted: true, executionSuccessful: true },
              autoCheck: true,
              manualOverride: false
            },
            hints: ['Use test data for safety', 'Check each step\'s output'],
            estimatedTime: 3,
            isOptional: false,
            order: 2
          },
          {
            id: 'completion',
            type: 'completion',
            title: 'Congratulations!',
            description: 'You\'ve created your first workflow',
            content: {
              text: 'Great job! You\'ve successfully created and tested your first workflow.',
              links: [
                { title: 'Explore Templates', url: '/templates' },
                { title: 'Advanced Features', url: '/tutorials/advanced' }
              ]
            },
            hints: [],
            estimatedTime: 1,
            isOptional: false,
            order: 3
          }
        ],
        outcomes: ['Created first workflow', 'Understood basic concepts', 'Ready for advanced features'],
        tags: ['beginner', 'quick', 'essential'],
        isActive: true
      },
      {
        id: 'ai_integration',
        name: 'AI-Powered Workflows',
        description: 'Learn to build intelligent workflows with AI capabilities',
        targetUserTypes: ['developer', 'business_user', 'team_lead'],
        targetExperience: ['intermediate', 'advanced'],
        targetGoals: ['ai_workflows', 'automate_tasks'],
        estimatedDuration: 25,
        difficulty: 'medium',
        steps: [
          {
            id: 'ai_intro',
            type: 'tutorial',
            title: 'Introduction to AI Nodes',
            description: 'Understand how AI enhances your workflows',
            content: {
              text: 'AI nodes can process text, extract data, make decisions, and more.',
              video: '/videos/ai_introduction.mp4'
            },
            hints: ['AI requires prompt engineering', 'Start with simple prompts'],
            estimatedTime: 5,
            isOptional: false,
            order: 0
          },
          {
            id: 'create_ai_workflow',
            type: 'hands_on',
            title: 'Build an AI Workflow',
            description: 'Create a workflow that uses AI to process data',
            content: {
              interactive: {
                type: 'workflow_builder',
                config: { enableAI: true, template: 'ai_data_extraction' }
              }
            },
            validation: {
              type: 'creation',
              criteria: { aiNodeAdded: true, workflowSaved: true },
              autoCheck: true,
              manualOverride: true
            },
            hints: ['Use the LLM node from the sidebar', 'Configure your prompt carefully'],
            estimatedTime: 10,
            isOptional: false,
            order: 1
          },
          {
            id: 'prompt_optimization',
            type: 'tutorial',
            title: 'Optimizing AI Prompts',
            description: 'Learn best practices for prompt engineering',
            content: {
              text: 'Good prompts are specific, clear, and include examples.',
              codeExample: 'Extract the customer name and email from this text: {{input}}'
            },
            hints: ['Be specific about output format', 'Include examples when possible'],
            estimatedTime: 5,
            isOptional: true,
            order: 2
          },
          {
            id: 'test_ai_workflow',
            type: 'test_execution',
            title: 'Test AI Processing',
            description: 'Run your AI workflow with sample data',
            content: {
              checklist: [
                { item: 'Prepare test data', completed: false },
                { item: 'Execute workflow', completed: false },
                { item: 'Review AI output quality', completed: false },
                { item: 'Refine prompts if needed', completed: false }
              ]
            },
            validation: {
              type: 'execution',
              criteria: { aiWorkflowExecuted: true },
              autoCheck: true,
              manualOverride: false
            },
            hints: ['Test with various input types', 'Check output consistency'],
            estimatedTime: 5,
            isOptional: false,
            order: 3
          }
        ],
        prerequisites: ['quick_start'],
        outcomes: ['AI workflow creation', 'Prompt engineering skills', 'Advanced automation techniques'],
        tags: ['ai', 'intermediate', 'intelligent'],
        isActive: true
      }
    ];

    flows.forEach(flowData => {
      const flow: OnboardingFlow = {
        ...flowData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.flows.set(flow.id, flow);
    });

    console.log('🎓 Initialized default onboarding flows');
  }

  private initializeTutorials(): void {
    const tutorials: Omit<Tutorial, 'createdAt' | 'updatedAt'>[] = [
      {
        id: 'workflow_basics',
        title: 'Workflow Building Fundamentals',
        description: 'Master the core concepts of workflow automation',
        category: 'getting_started',
        difficulty: 'beginner',
        duration: 15,
        prerequisites: [],
        learningObjectives: [
          'Understand workflow components',
          'Learn about triggers and actions',
          'Master data flow concepts'
        ],
        content: {
          sections: [
            {
              id: 'intro',
              title: 'What is a Workflow?',
              content: 'A workflow is a series of automated steps that process data or perform actions.',
              keyPoints: ['Automation saves time', 'Workflows reduce errors', 'Scalable solutions'],
              duration: 3
            },
            {
              id: 'components',
              title: 'Workflow Components',
              content: 'Every workflow has triggers, actions, and data flow between them.',
              keyPoints: ['Triggers start workflows', 'Actions perform tasks', 'Data flows between nodes'],
              duration: 5
            },
            {
              id: 'best_practices',
              title: 'Best Practices',
              content: 'Follow these guidelines to build reliable, maintainable workflows.',
              keyPoints: ['Start simple', 'Test thoroughly', 'Document your logic'],
              duration: 7
            }
          ],
          totalSteps: 3,
          hasVideo: false,
          hasInteractive: true,
          hasQuiz: true
        },
        exercises: [
          {
            id: 'build_basic_workflow',
            title: 'Build Your First Workflow',
            description: 'Create a simple automation using the concepts learned',
            type: 'practice',
            instructions: [
              'Choose a trigger',
              'Add an action',
              'Connect them with data flow',
              'Test the workflow'
            ],
            expectedOutcome: 'A working workflow with proper data flow',
            validation: {
              type: 'automatic',
              criteria: ['Workflow created', 'Trigger configured', 'Action added', 'Test successful'],
              successMessage: 'Great! You\'ve mastered the basics.',
              failureMessage: 'Review the concepts and try again.'
            },
            hints: ['Start with a simple email trigger', 'Use test data for safety']
          }
        ],
        resources: [
          {
            id: 'workflow_guide',
            title: 'Complete Workflow Guide',
            type: 'documentation',
            url: '/docs/workflows',
            description: 'Comprehensive guide to workflow building',
            isExternal: false
          }
        ],
        isInteractive: true,
        tags: ['fundamentals', 'beginner', 'essential'],
        rating: 4.8,
        completionRate: 87
      }
    ];

    tutorials.forEach(tutorialData => {
      const tutorial: Tutorial = {
        ...tutorialData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.tutorials.set(tutorial.id, tutorial);
    });

    console.log('🎓 Initialized tutorial library');
  }

  private initializeAchievements(): void {
    const achievementTemplates: Omit<Achievement, 'unlockedAt'>[] = [
      {
        id: 'first_workflow',
        name: 'First Steps',
        description: 'Created your first workflow',
        icon: '🎯',
        category: 'onboarding',
        rarity: 'common'
      },
      {
        id: 'ai_pioneer',
        name: 'AI Pioneer',
        description: 'Built your first AI-powered workflow',
        icon: '🤖',
        category: 'ai',
        rarity: 'uncommon'
      },
      {
        id: 'quick_learner',
        name: 'Quick Learner',
        description: 'Completed onboarding in record time',
        icon: '⚡',
        category: 'onboarding',
        rarity: 'rare'
      },
      {
        id: 'workflow_master',
        name: 'Workflow Master',
        description: 'Created 10 successful workflows',
        icon: '👑',
        category: 'workflow',
        rarity: 'legendary'
      }
    ];

    // Initialize empty achievements for all users
    console.log('🏆 Initialized achievement system');
  }

  private calculateFlowRelevance(profile: OnboardingProfile, flow: OnboardingFlow): number {
    let score = 0;

    // User type match
    if (flow.targetUserTypes.includes(profile.userType)) score += 0.3;
    
    // Experience level match
    if (flow.targetExperience.includes(profile.experience)) score += 0.3;
    
    // Goals alignment
    const goalMatch = profile.goals.filter(goal => flow.targetGoals.includes(goal)).length;
    score += (goalMatch / Math.max(profile.goals.length, 1)) * 0.4;

    return Math.min(score, 1);
  }

  private generateRecommendations(userId: string): void {
    // Implementation would analyze user profile and generate recommendations
    console.log(`🎯 Generated recommendations for user ${userId}`);
  }

  private getDefaultRecommendations(userId: string): OnboardingRecommendation[] {
    return [
      {
        userId,
        flowId: 'quick_start',
        reason: 'profile_match',
        confidence: 0.9,
        personalizedMessage: 'Start with the basics and build your first workflow',
        estimatedValue: 'Get productive in 10 minutes',
        prerequisites: [],
        nextSteps: ['Complete quick start', 'Explore templates'],
        generatedAt: new Date()
      }
    ];
  }

  private determineRecommendationReason(profile: OnboardingProfile, flow: OnboardingFlow): RecommendationReason {
    if (profile.goals.some(goal => flow.targetGoals.includes(goal))) {
      return 'goal_alignment';
    }
    if (flow.targetUserTypes.includes(profile.userType)) {
      return 'profile_match';
    }
    return 'feature_discovery';
  }

  private generatePersonalizedMessage(profile: OnboardingProfile, flow: OnboardingFlow): string {
    const messages = {
      'quick_start': `Perfect for ${profile.userType}s who want to ${profile.goals[0]?.replace('_', ' ')}`,
      'ai_integration': 'Unlock the power of AI in your workflows',
      'default': `Recommended based on your ${profile.experience} experience level`
    };
    
    return messages[flow.id] || messages.default;
  }

  private calculateEstimatedValue(profile: OnboardingProfile, flow: OnboardingFlow): string {
    const values = {
      'quick_start': 'Start automating in 10 minutes',
      'ai_integration': 'Add intelligent processing to workflows',
      'default': `Learn ${flow.name.toLowerCase()} concepts`
    };
    
    return values[flow.id] || values.default;
  }

  private generateNextSteps(profile: OnboardingProfile, flow: OnboardingFlow): string[] {
    return [
      `Complete ${flow.name}`,
      'Apply learnings to your use case',
      'Explore advanced features'
    ];
  }

  private validateStepCompletion(step: OnboardingStep, data: any): boolean {
    if (!step.validation) return true;
    
    // Simplified validation logic
    switch (step.validation.type) {
      case 'creation':
        return data?.created === true;
      case 'execution':
        return data?.executed === true && data?.successful === true;
      case 'completion':
        return true;
      default:
        return false;
    }
  }

  private checkAchievements(userId: string, flowId: string, stepId: string): Achievement[] {
    const newAchievements: Achievement[] = [];
    
    // Check for first workflow achievement
    if (stepId === 'create_first_workflow') {
      newAchievements.push({
        id: 'first_workflow',
        name: 'First Steps',
        description: 'Created your first workflow',
        icon: '🎯',
        category: 'onboarding',
        rarity: 'common',
        unlockedAt: new Date()
      });
    }

    // Check for AI pioneer achievement
    if (flowId === 'ai_integration' && stepId === 'create_ai_workflow') {
      newAchievements.push({
        id: 'ai_pioneer',
        name: 'AI Pioneer',
        description: 'Built your first AI-powered workflow',
        icon: '🤖',
        category: 'ai',
        rarity: 'uncommon',
        unlockedAt: new Date()
      });
    }

    // Add achievements to user's collection
    if (newAchievements.length > 0) {
      const userAchievements = this.achievements.get(userId) || [];
      userAchievements.push(...newAchievements);
      this.achievements.set(userId, userAchievements);
    }

    return newAchievements;
  }

  private personalizetutorials(tutorials: Tutorial[], profile: OnboardingProfile): Tutorial[] {
    // Sort tutorials based on user profile
    return tutorials.sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      
      // Prefer tutorials matching user's experience level
      if (a.difficulty === profile.experience) scoreA += 2;
      if (b.difficulty === profile.experience) scoreB += 2;
      
      // Prefer tutorials aligned with user goals
      const aGoalMatch = profile.goals.some(goal => a.tags.includes(goal.replace('_', ' ')));
      const bGoalMatch = profile.goals.some(goal => b.tags.includes(goal.replace('_', ' ')));
      if (aGoalMatch) scoreA += 1;
      if (bGoalMatch) scoreB += 1;
      
      return scoreB - scoreA;
    });
  }

  private calculateDropoffPoints(flow: OnboardingFlow, progressList: UserProgress[]): Array<{ stepId: string; dropoffRate: number }> {
    const dropoffPoints: Array<{ stepId: string; dropoffRate: number }> = [];
    
    flow.steps.forEach(step => {
      const startedStep = progressList.filter(p => p.currentStep >= step.order).length;
      const completedStep = progressList.filter(p => p.completedSteps.includes(step.id)).length;
      
      const dropoffRate = startedStep > 0 ? ((startedStep - completedStep) / startedStep) * 100 : 0;
      dropoffPoints.push({ stepId: step.id, dropoffRate });
    });
    
    return dropoffPoints;
  }

  private calculateUserSegments(profiles: OnboardingProfile[], progressList: UserProgress[]): Array<{
    segment: string;
    count: number;
    completionRate: number;
    preferredFlows: string[];
  }> {
    const segments: Record<string, {
      count: number;
      completed: number;
      flows: Record<string, number>;
    }> = {};

    profiles.forEach(profile => {
      const segment = `${profile.userType}_${profile.experience}`;
      if (!segments[segment]) {
        segments[segment] = { count: 0, completed: 0, flows: {} };
      }
      
      segments[segment].count++;
      
      const userProgress = progressList.filter(p => p.userId === profile.userId);
      const completed = userProgress.filter(p => p.status === 'completed').length;
      if (completed > 0) segments[segment].completed++;
      
      userProgress.forEach(p => {
        segments[segment].flows[p.flowId] = (segments[segment].flows[p.flowId] || 0) + 1;
      });
    });

    return Object.entries(segments).map(([segment, data]) => ({
      segment,
      count: data.count,
      completionRate: data.count > 0 ? (data.completed / data.count) * 100 : 0,
      preferredFlows: Object.entries(data.flows)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([flowId]) => flowId)
    }));
  }
}

export const onboardingManager = new OnboardingManager();