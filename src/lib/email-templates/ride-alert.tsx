import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  headline?: string
  rideTitle?: string
  startPoint?: string
  when?: string
  distanceKm?: number
  radiusKm?: number
  rideUrl?: string
}

const Email = ({
  headline = 'Nowa wyprawa w Twoim promieniu',
  rideTitle = 'Wyprawa motocyklowa',
  startPoint = '',
  when = '',
  distanceKm,
  radiusKm,
  rideUrl = 'https://www.apptrip.motorcycles',
}: Props) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>{`${headline}: ${rideTitle}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>MOTOR TRIP</Text>
        <Heading style={h1}>{headline}</Heading>
        <Section style={card}>
          <Text style={title}>{rideTitle}</Text>
          {startPoint ? <Text style={row}>Zbiórka: {startPoint}</Text> : null}
          {when ? <Text style={row}>Start: {when}</Text> : null}
          {typeof distanceKm === 'number' ? (
            <Text style={row}>
              Odległość: {distanceKm} km{typeof radiusKm === 'number' ? ` (promień ${radiusKm} km)` : ''}
            </Text>
          ) : null}
        </Section>
        <Button href={rideUrl} style={button}>
          Zobacz szczegóły wyprawy
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Dostajesz tę wiadomość, bo włączyłeś alerty o wyprawach w wybranym promieniu.
          Ustawienia zmienisz na stronie głównej Motor Trip.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data['headline'] ?? 'Wyprawa w Twojej okolicy'} — ${data['rideTitle'] ?? 'Motor Trip'}`,
  displayName: 'Alert o wyprawie w promieniu',
  previewData: {
    headline: 'Nowa wyprawa 42 km od: Poznań',
    rideTitle: 'Kręte drogi Roztocza',
    startPoint: 'Rynek, Poznań',
    when: '15 sierpnia, 09:00',
    distanceKm: 42,
    radiusKm: 100,
    rideUrl: 'https://www.apptrip.motorcycles',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '560px' }
const brand = {
  fontSize: '12px',
  letterSpacing: '2px',
  fontWeight: 700,
  color: '#ea6a12',
  margin: '0 0 12px',
}
const h1 = { fontSize: '22px', lineHeight: '1.3', color: '#141414', margin: '0 0 16px' }
const card = {
  border: '1px solid #e6e6e6',
  borderRadius: '10px',
  padding: '16px 18px',
  backgroundColor: '#fafafa',
}
const title = { fontSize: '17px', fontWeight: 700, color: '#141414', margin: '0 0 8px' }
const row = { fontSize: '14px', color: '#4a4a4a', margin: '0 0 4px' }
const button = {
  display: 'inline-block',
  marginTop: '20px',
  backgroundColor: '#ea6a12',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 700,
  padding: '12px 20px',
  borderRadius: '8px',
  textDecoration: 'none',
}
const hr = { borderColor: '#e6e6e6', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#8a8a8a', margin: 0 }
