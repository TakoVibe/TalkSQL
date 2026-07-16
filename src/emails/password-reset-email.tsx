import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text } from "@react-email/components";

type PasswordResetEmailProps = {
  code: string;
  logoUrl: string;
};

export function PasswordResetEmail({ code, logoUrl }: PasswordResetEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your TalkSQL password reset code is {code}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Img src={logoUrl} alt="TalkSQL" width="44" height="44" style={logo} />
          <Text style={eyebrow}>PASSWORD RESET</Text>
          <Heading style={heading}>Choose a new password</Heading>
          <Text style={copy}>Enter this code in TalkSQL to reset your password. It expires in five minutes.</Text>
          <Section style={codeBox}><Text style={codeText}>{code}</Text></Section>
          <Text style={finePrint}>If you did not request a password reset, you can safely ignore this email. Your password will not change.</Text>
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
const codeBox = { backgroundColor: "#e6f1eb", borderRadius: "12px", margin: "24px 0 0", padding: "18px 22px", textAlign: "center" as const };
const codeText = { color: "#205b43", fontFamily: "Consolas, monospace", fontSize: "30px", fontWeight: "700", letterSpacing: "8px", lineHeight: "34px", margin: "0" };
const finePrint = { color: "#66716b", fontSize: "13px", lineHeight: "20px", margin: "20px 0 0" };
const footer = { color: "#66716b", fontSize: "12px", lineHeight: "18px", margin: "28px 0 0" };
