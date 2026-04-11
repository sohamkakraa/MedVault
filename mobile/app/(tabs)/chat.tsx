import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import TextInput from '@/components/ui/TextInput';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Send, Paperclip, MessageCircle } from 'lucide-react-native';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const SUGGESTION_CHIPS = [
  'What was my last HbA1c?',
  'Am I still on Metformin?',
  'What time should I take my medications?',
  'Explain my last lab report',
];

export default function ChatScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isTablet = width >= 768;

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSendMessage = (text: string = input) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        text: 'I understand your question. Based on your records, ' +
          (text.includes('HbA1c')
            ? 'your most recent HbA1c was 6.8% on April 5, 2026.'
            : text.includes('Metformin')
            ? 'you are currently taking Metformin 500mg twice daily.'
            : text.includes('time')
            ? 'you should take your medications with breakfast and dinner as prescribed.'
            : text.includes('lab')
            ? 'your recent labs show good overall control with slight room for improvement in cholesterol management.'
            : 'this is a helpful question for your health. Please let me know if you need clarification.'),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
    }, 1000);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.type === 'user';

    return (
      <View
        style={[
          styles.messageRow,
          { justifyContent: isUser ? 'flex-end' : 'flex-start', marginVertical: spacing.sm },
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            {
              backgroundColor: isUser ? theme.accent : theme.panel2,
              borderColor: theme.border,
              maxWidth: isTablet ? '60%' : '80%',
            },
          ]}
        >
          <Text
            style={[
              styles.messageText,
              { color: isUser ? (theme.fg === '#151515' ? '#ffffff' : theme.bg) : theme.fg },
            ]}
          >
            {item.text}
          </Text>
          {item.type === 'assistant' && (
            <Text style={[styles.disclaimer, { color: theme.muted, marginTop: spacing.sm }]}>
              Not medical advice
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (messages.length > 0) return null;

    return (
      <View style={[styles.emptyState, { width: isTablet ? '60%' : '100%' }]}>
        <MessageCircle size={48} color={theme.accent} strokeWidth={1.5} />
        <Text style={[styles.emptyTitle, { color: theme.fg, marginTop: spacing.lg }]}>
          Hello, I'm Uma
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.muted, marginTop: spacing.sm }]}>
          Your personal health companion. Ask me anything about your health records and medications.
        </Text>

        <View style={[styles.suggestionsContainer, { marginTop: spacing.xl }]}>
          {SUGGESTION_CHIPS.map((chip, i) => (
            <Button
              key={i}
              title={chip}
              variant="outline"
              size="sm"
              onPress={() => handleSendMessage(chip)}
              style={{ marginBottom: spacing.md }}
            />
          ))}
        </View>

        <View style={[styles.disclaimer, { marginTop: spacing.xl, borderTopColor: theme.border }]}>
          <Text style={[styles.disclaimerText, { color: theme.muted }]}>
            UMA provides health information based on your records. It is not a substitute for
            professional medical advice. Always consult your doctor.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messageList,
            { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
            messages.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmptyState()}
          showsVerticalScrollIndicator={false}
        />

        {loading && (
          <View style={[styles.loadingIndicator, { paddingHorizontal: spacing.lg }]}>
            <ActivityIndicator color={theme.accent} size="small" />
            <Text style={[styles.loadingText, { color: theme.muted, marginLeft: spacing.md }]}>
              Uma is thinking...
            </Text>
          </View>
        )}

        <View
          style={[
            styles.inputContainer,
            {
              borderTopColor: theme.border,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.lg,
            },
          ]}
        >
          <View style={styles.inputRow}>
            <Button
              title=""
              onPress={() => {}}
              variant="ghost"
              size="sm"
              style={{ flex: 0, paddingHorizontal: spacing.sm }}
            >
              <Paperclip size={20} color={theme.accent} />
            </Button>

            <TextInput
              placeholder="Ask me anything..."
              value={input}
              onChangeText={setInput}
              editable={!loading}
              onSubmitEditing={() => handleSendMessage()}
              returnKeyType="send"
              style={{ flex: 1, marginHorizontal: spacing.sm }}
            />

            <Button
              title=""
              onPress={() => handleSendMessage()}
              disabled={!input.trim() || loading}
              variant="ghost"
              size="sm"
              style={{ flex: 0, paddingHorizontal: spacing.sm }}
            >
              <Send size={20} color={theme.accent} />
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageList: {
    flexGrow: 1,
  },
  emptyListContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'fraunces-bold',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'space-grotesk',
    lineHeight: 20,
  },
  suggestionsContainer: {
    width: '100%',
    gap: spacing.md,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: spacing.sm,
  },
  messageBubble: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'space-grotesk',
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: 'space-grotesk',
  },
  loadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
