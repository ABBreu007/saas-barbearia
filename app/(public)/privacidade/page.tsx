import Link from "next/link";
import styles from "./privacidade.module.css";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Política de Privacidade</h1>
        <p className={styles.updated}>Última atualização: julho de 2026</p>

        <p>
          Esta Política explica como o SaaS Barbearia ("nós", "sistema") coleta, usa e protege dados
          pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).
          Se você é uma barbearia usando o sistema (barbeiro/dono) ou um cliente final agendando um
          horário, esta página se aplica a você.
        </p>

        <h2>1. Quais dados coletamos</h2>
        <p><strong>Do barbeiro/dono da barbearia (quem cria a conta):</strong></p>
        <ul>
          <li>Nome, e-mail e senha (a senha nunca é vista por nós — o Supabase Auth cuida do login com hash)</li>
          <li>Nome, descrição, endereço, redes sociais e foto da barbearia</li>
          <li>Dados de uso do sistema (agendamentos criados, serviços cadastrados, horários de funcionamento)</li>
        </ul>
        <p><strong>Do cliente final (quem agenda um horário pela página pública):</strong></p>
        <ul>
          <li>Nome e telefone (obrigatórios para agendar)</li>
          <li>E-mail, se informado ao avaliar a barbearia</li>
          <li>Histórico de agendamentos feitos com aquela barbearia (serviço, data, horário, status)</li>
        </ul>
        <p>
          Não coletamos dados de pagamento de clientes finais — o pagamento do corte/serviço é feito
          diretamente na barbearia, fora do sistema. A única cobrança que passa pelo sistema é a
          mensalidade da barbearia conosco (via Mercado Pago).
        </p>

        <h2>2. Por que coletamos esses dados</h2>
        <p>
          Para permitir o agendamento de horários (execução do relacionamento entre você e a
          barbearia), para o dono da barbearia gerenciar sua agenda e negócio, e para nós fazermos a
          barbearia funcionar como cliente pagante do sistema. Não vendemos dados pessoais a terceiros
          nem os usamos para publicidade.
        </p>

        <h2>3. Com quem compartilhamos dados</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — hospeda nosso banco de dados (fisicamente no Brasil, região São
            Paulo) e cuida da autenticação. É um operador de dados, não um terceiro que usa seus dados
            para fins próprios.
          </li>
          <li>
            <strong>Mercado Pago</strong> — processa a cobrança da mensalidade da barbearia. Não tem
            acesso aos dados de clientes finais.
          </li>
        </ul>
        <p>Cada barbearia só enxerga os dados dos próprios clientes — isso é reforçado tecnicamente (Row Level Security no banco), não só por regra de código.</p>

        <h2>4. Por quanto tempo guardamos os dados</h2>
        <p>
          Enquanto a conta da barbearia estiver ativa. Histórico de agendamentos concluídos pode ser
          mantido além da exclusão de um cliente específico, de forma anonimizada, para preservar os
          registros financeiros/contábeis da barbearia (ver seção 6).
        </p>

        <h2>5. Segurança</h2>
        <p>
          Conexão criptografada (HTTPS), senhas nunca armazenadas em texto puro, isolamento de dados
          entre barbearias reforçado no banco de dados (RLS), e acesso a dados sensíveis restrito a
          rotas server-side.
        </p>

        <h2>6. Seus direitos (Art. 18 da LGPD)</h2>
        <p>Você pode solicitar a qualquer momento:</p>
        <ul>
          <li>Confirmação de que tratamos seus dados, e acesso a eles</li>
          <li>Correção de dados incompletos ou desatualizados</li>
          <li>
            Exclusão/anonimização dos seus dados — para clientes finais, isso pode ser feito
            diretamente na página de agendamento da barbearia, na seção{" "}
            <strong>"Já tem um agendamento?"</strong>, buscando pelo seu telefone. O nome e telefone são
            removidos; o histórico de agendamento é mantido anonimizado por exigência contábil da
            barbearia.
          </li>
          <li>Portabilidade dos dados a outro fornecedor</li>
        </ul>
        <p>
          Para exercer qualquer um desses direitos (incluindo a exclusão da conta de uma barbearia
          inteira, feita por quem é dono dela em Conta → Excluir minha conta), ou tirar dúvidas, envie um
          e-mail para{" "}
          <a href="mailto:solucaonexo.co@gmail.com">solucaonexo.co@gmail.com</a>.
        </p>

        <h2>7. Contato</h2>
        <p>
          Dúvidas sobre esta política ou sobre o tratamento dos seus dados:{" "}
          <a href="mailto:solucaonexo.co@gmail.com">solucaonexo.co@gmail.com</a>.
        </p>

        <div className={styles.backRow}>
          <Link href="/">Voltar</Link>
        </div>
      </div>
    </div>
  );
}
