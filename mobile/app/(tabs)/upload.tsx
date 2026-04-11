import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, spacing, radius } from '@/lib/theme';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { FileText, Upload as UploadIcon, CheckCircle, Clock, AlertCircle } from 'lucide-react-native';

interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  uploadedAt: Date;
  status: 'processing' | 'success' | 'error';
  progress?: number;
}

export default function UploadScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [documents, setDocuments] = useState<UploadedDocument[]>([
    {
      id: '1',
      name: 'Lab Report - April 2026',
      type: 'Lab Report',
      uploadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: 'success',
    },
    {
      id: '2',
      name: 'Prescription - March 2026',
      type: 'Prescription',
      uploadedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: 'success',
    },
  ]);
  const [uploading, setUploading] = useState(false);
  const isTablet = width >= 768;

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newDoc: UploadedDocument = {
          id: Date.now().toString(),
          name: asset.name,
          type: 'Medical Document',
          uploadedAt: new Date(),
          status: 'processing',
          progress: 0,
        };

        setDocuments((prev) => [newDoc, ...prev]);
        setUploading(true);

        // Simulate upload progress
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 30;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);

            // Update to success
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === newDoc.id
                  ? { ...doc, status: 'success', progress: 100 }
                  : doc
              )
            );
            setUploading(false);
          } else {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === newDoc.id ? { ...doc, progress } : doc
              )
            );
          }
        }, 300);
      }
    } catch (error) {
      console.error('Document pick error:', error);
    }
  };

  const getStatusIcon = (status: UploadedDocument['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={20} color={theme.success} />;
      case 'processing':
        return <Clock size={20} color={theme.warning} />;
      case 'error':
        return <AlertCircle size={20} color={theme.error} />;
    }
  };

  const getStatusColor = (status: UploadedDocument['status']) => {
    switch (status) {
      case 'success':
        return theme.success;
      case 'processing':
        return theme.warning;
      case 'error':
        return theme.error;
    }
  };

  const renderDocument = ({ item }: { item: UploadedDocument }) => (
    <Card
      style={[
        styles.documentCard,
        {
          borderColor:
            item.status === 'error'
              ? theme.error + '40'
              : item.status === 'processing'
              ? theme.warning + '40'
              : theme.border,
          width: isTablet ? '48%' : '100%',
        },
      ]}
      padding="md"
    >
      <View style={styles.documentHeader}>
        <FileText size={24} color={getStatusColor(item.status)} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[styles.documentName, { color: theme.fg }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.documentType, { color: theme.muted }]}>{item.type}</Text>
        </View>
        {getStatusIcon(item.status)}
      </View>

      {item.status === 'processing' && item.progress !== undefined && (
        <View style={[styles.progressBar, { backgroundColor: theme.panel2, marginTop: spacing.md }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${item.progress}%`,
                backgroundColor: getStatusColor('processing'),
              },
            ]}
          />
        </View>
      )}

      <Text style={[styles.uploadDate, { color: theme.muted, marginTop: spacing.sm }]}>
        {item.uploadedAt.toLocaleDateString()}
      </Text>

      {item.status === 'success' && (
        <Button
          title="View Details"
          variant="ghost"
          size="sm"
          onPress={() => {}}
          style={{ marginTop: spacing.md }}
        />
      )}
    </Card>
  );

  const contentWidth = isTablet ? '48%' : '100%';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.fg }]}>Upload Records</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Upload PDFs of your medical documents for secure storage and analysis
          </Text>
        </View>

        {/* Upload Card */}
        <Card
          style={[
            styles.uploadCard,
            {
              borderColor: theme.accent,
              borderStyle: 'dashed',
              width: contentWidth,
            },
          ]}
          padding="lg"
        >
          <View style={styles.uploadContent}>
            <UploadIcon size={40} color={theme.accent} />
            <Text style={[styles.uploadTitle, { color: theme.fg, marginTop: spacing.lg }]}>
              Choose a Document
            </Text>
            <Text style={[styles.uploadHint, { color: theme.muted, marginTop: spacing.sm }]}>
              Select a PDF file from your device
            </Text>
          </View>

          <Button
            title={uploading ? 'Uploading...' : 'Select File'}
            onPress={handlePickDocument}
            disabled={uploading}
            style={{ marginTop: spacing.lg }}
          />
        </Card>

        {/* Recent Uploads */}
        {documents.length > 0 && (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={[styles.sectionTitle, { color: theme.fg, marginBottom: spacing.lg }]}>
              Recent Uploads
            </Text>

            <View
              style={[
                styles.documentGrid,
                {
                  justifyContent: isTablet ? 'space-between' : 'flex-start',
                },
              ]}
            >
              {documents.map((doc) => (
                <View key={doc.id} style={[{ width: contentWidth }, styles.documentWrapper]}>
                  {renderDocument({ item: doc })}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Info Section */}
        <Card
          variant="muted"
          style={[styles.infoCard, { width: contentWidth, marginTop: spacing.xl }]}
          padding="md"
        >
          <Text style={[styles.infoTitle, { color: theme.fg, marginBottom: spacing.sm }]}>
            What Documents Can I Upload?
          </Text>
          <View style={styles.infoList}>
            {[
              'Lab Reports',
              'Prescription Records',
              'Medical Bills',
              'Imaging Results',
              'Discharge Summaries',
              'Other Medical Documents',
            ].map((item, i) => (
              <View key={i} style={styles.infoItem}>
                <View
                  style={[
                    styles.infoBullet,
                    {
                      backgroundColor: theme.accent,
                    },
                  ]}
                />
                <Text style={[styles.infoItemText, { color: theme.fg }]}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { borderTopColor: theme.border, marginTop: spacing.xl }]}>
          <Text style={[styles.disclaimerText, { color: theme.muted }]}>
            Your documents are stored securely and encrypted. They are never shared with third
            parties without your consent.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'fraunces-bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'space-grotesk',
    lineHeight: 20,
  },
  uploadCard: {
    borderWidth: 2,
  },
  uploadContent: {
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  uploadHint: {
    fontSize: 13,
    fontFamily: 'space-grotesk',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  documentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  documentWrapper: {
    marginBottom: spacing.lg,
  },
  documentCard: {
    minHeight: 120,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  documentType: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
    marginTop: spacing.xs,
  },
  uploadDate: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
  },
  progressBar: {
    height: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  infoCard: {
    width: '100%',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  infoList: {
    marginTop: spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  infoBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.md,
  },
  infoItemText: {
    fontSize: 13,
    fontFamily: 'space-grotesk',
    flex: 1,
  },
  disclaimer: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    width: '100%',
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'space-grotesk',
  },
});
