import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useOrderStore, chatMsgText } from '@/store/orders';
import { useAuthStore } from '@/store/auth';
import { ChatLang } from '@/types';
import { QUICK_MESSAGE_KEYS } from '@/constants';
import { useT, langOf } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

// Чат с автопереводом: быстрые фразы — ключи словаря (мгновенно),
// свободный текст — {text, lang, tr, pending} с серверным переводом и пометкой «🌐 переведено»
export const ChatScreen: React.FC = () => {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const role: 'customer' | 'driver' = user?.role === 'driver' ? 'driver' : 'customer';
  const rawLang = langOf(role);
  const viewerLang: ChatLang = rawLang === 'ru' || rawLang === 'en' ? rawLang : 'pl';
  const orderId = useOrderStore((s) => s.activeOrderId) ?? 'o-past-1';
  const messages = useOrderStore((s) => s.messages.filter((m) => m.orderId === orderId));
  const sendMessage = useOrderStore((s) => s.sendMessage);
  const sendQuick = useOrderStore((s) => s.sendQuick);
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim() || !user) return;
    sendMessage(orderId, user.id, role, text);
    setText('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 54 }}>
      <FlatList
        data={messages} keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.l }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.faint }}>{t('chat.first')}</Text>}
        renderItem={({ item }) => {
          const r = chatMsgText(item, viewerLang);
          if (item.type === 'system') return (
            <Text style={{ textAlign: 'center', color: colors.faint, fontSize: 12, marginVertical: 6 }}>— {r.text} —</Text>
          );
          const mine = item.senderId === user?.id;
          return (
            <View style={{
              alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%',
              backgroundColor: mine ? colors.brand : '#FFF',
              borderRadius: radius.l, padding: 12, marginVertical: 4,
            }}>
              <Text style={{ color: mine ? '#FFF' : colors.ink }}>{r.text}</Text>
              {r.pending ? (
                <Text style={{ color: mine ? '#CFEFE3' : colors.faint, fontSize: 10, marginTop: 3 }}>{t('chat.translating')}</Text>
              ) : r.translated ? (
                <Text style={{ color: mine ? '#CFEFE3' : colors.faint, fontSize: 10, marginTop: 3 }}>{t('chat.translated')}</Text>
              ) : null}
            </View>
          );
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 6 }} contentContainerStyle={{ paddingHorizontal: spacing.l }}>
        {QUICK_MESSAGE_KEYS.map((key, idx) => (
          <TouchableOpacity key={key} onPress={() => user && sendQuick(orderId, user.id, role, idx)}
            style={{ backgroundColor: '#FFF', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: colors.line }}>
            <Text style={{ fontSize: 12, color: colors.sub }}>{t(key)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', padding: spacing.m, backgroundColor: '#FFF' }}>
        <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')}
          style={{ flex: 1, backgroundColor: '#F8F9FB', borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 10 }} />
        <TouchableOpacity onPress={send}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
          <Text style={{ color: '#FFF', fontSize: 16 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
