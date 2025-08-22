import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Lock, 
  Sparkles, 
  CheckCircle2, 
  CreditCard, 
  Brain,
  Zap,
  X
} from 'lucide-react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose, feature }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-white relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>
        
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Unlock {feature}
          </CardTitle>
          <p className="text-gray-600">
            This premium feature is available for paid subscribers only
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Feature Benefits */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              What You Get with {feature}:
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">500+ App Integrations</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Multi-AI Models (Gemini, Claude, GPT-4)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Real Google Apps Script Generation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">One-Click Deployment</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Unlimited Workflows</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Visual Drag & Drop Builder</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Priority Support</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm">50x Cheaper than AI Agents</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Options */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-2">Starter Plan</h4>
              <div className="text-2xl font-bold text-blue-600 mb-2">$99/month</div>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• 10 Active Automations</li>
                <li>• AI Builder Access</li>
                <li>• 500+ App Integrations</li>
                <li>• Email Support</li>
              </ul>
              <Button className="w-full mt-4 bg-blue-600 hover:bg-blue-700">
                <CreditCard className="w-4 h-4 mr-2" />
                Start 7-Day Free Trial
              </Button>
            </div>
            
            <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50 relative">
              <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white">
                MOST POPULAR
              </Badge>
              <h4 className="font-semibold mb-2">Professional</h4>
              <div className="text-2xl font-bold text-purple-600 mb-2">$199/month</div>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Unlimited Automations</li>
                <li>• Advanced AI Features</li>
                <li>• Priority Support</li>
                <li>• Custom Integrations</li>
              </ul>
              <Button className="w-full mt-4 bg-purple-600 hover:bg-purple-700">
                <Sparkles className="w-4 h-4 mr-2" />
                Start 7-Day Free Trial
              </Button>
            </div>
          </div>

          {/* Value Proposition */}
          <div className="text-center bg-green-50 p-4 rounded-lg">
            <h4 className="font-semibold text-green-800 mb-2">
              💰 Save $58,800/year vs AI Agents
            </h4>
            <p className="text-sm text-green-700">
              Get the same automation power as $5,000/month AI agents for just $99-199/month
            </p>
          </div>

          {/* Alternative Options */}
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={onClose}>
              Maybe Later
            </Button>
            <Button 
              onClick={() => window.open('/schedule', '_blank')}
              variant="outline"
            >
              📞 Book Demo First
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};