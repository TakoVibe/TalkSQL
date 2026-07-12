import { Body, Button, Container, Head, Heading, Html, Img, Preview, Text } from "@react-email/components";

type WelcomeEmailProps = {
  appUrl: string;
  logoUrl: string;
  name: string;
};

export function WelcomeEmail({ appUrl, logoUrl, name }: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your TalkSQL workspace is ready</Preview>
      <Body style={body}>
        <Container style={card}>
          <Img src={logoUrl} alt="TalkSQL" width="44" height="44" style={logo} />
          <Text style={eyebrow}>WELCOME TO TALKSQL</Text>
          <Heading style={heading}>Your workspace is ready, {name || "there"}.</Heading>
          <Text style={copy}>Connect your first database, inspect the schema, and turn trusted answers into a live dashboard.</Text>
          <Button href={appUrl} style={button}>Open TalkSQL →</Button>
          <Text style={footer}>TalkSQL · Your data, in conversation.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#f7f7f5", color: "#17211c", fontFamily: "Arial, Helvetica, sans-serif", margin: "0", padding: "32px 16px" };
const card = { backgroundColor: "#ffffff", border: "1px solid #dfe4df", borderRadius: "20px", margin: "0 auto", maxWidth: "560px", padding: "32px" };
const logo = { display: "block", margin: "0" };
const eyebrow = { color: "#27704f", fontSize: "12px", fontWeight: "700", letterSpacing: "1.5px", margin: "26px 0 0" };
const heading = { fontSize: "28px", letterSpacing: "-0.4px", lineHeight: "34px", margin: "10px 0 0" };
const copy = { color: "#526059", fontSize: "16px", lineHeight: "24px", margin: "16px 0 0" };
const button = { backgroundColor: "#205b43", borderRadius: "10px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "700", margin: "26px 0 0", padding: "12px 18px", textDecoration: "none" };
const footer = { color: "#66716b", fontSize: "12px", lineHeight: "18px", margin: "28px 0 0" };
