import { useEffect, useState } from "react";
import {
  Accordion,
  Anchor,
  Checkbox,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import {
  STAGING_COMPARE_URL,
  fetchPendingStagingPrs,
  type StagingPr,
} from "../utils/stagingPrs";

interface StagingChecklistModalProps {
  opened: boolean;
  onClose: () => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; prs: StagingPr[] };

// Preview-deploys-only QA aid (gated in MainMenu): lists PRs
// merged into `staging` but not yet promoted to `main`, each
// with its PR-body QC steps as session-local checkboxes — a
// local aid, never persisted or written back.
const StagingChecklistModal = ({
  opened,
  onClose,
}: StagingChecklistModalProps) => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Step ticks keyed by PR number then step index — session-only
  // per the spec; must not affect other users.
  const [checked, setChecked] = useState<
    Record<number, Set<number>>
  >({});

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setState({ kind: "loading" });
    fetchPendingStagingPrs()
      .then((prs) => {
        if (!cancelled) setState({ kind: "ready", prs });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const toggleStep = (prNumber: number, stepIndex: number) => {
    setChecked((prev) => {
      const steps = new Set(prev[prNumber] ?? []);
      if (steps.has(stepIndex)) steps.delete(stepIndex);
      else steps.add(stepIndex);
      return { ...prev, [prNumber]: steps };
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("menu.stagingChecklist")}
      fullScreen={isMobile}
      size="lg"
    >
      {state.kind === "loading" && (
        <Group position="center" py="xl">
          <Loader />
        </Group>
      )}

      {state.kind === "error" && (
        <Stack spacing="sm">
          <Text size="sm">
            {t("menu.stagingChecklistError")}
          </Text>
          <Anchor href={STAGING_COMPARE_URL} target="_blank">
            {t("menu.stagingChecklistCompare")}
          </Anchor>
        </Stack>
      )}

      {state.kind === "ready" && state.prs.length === 0 && (
        <Text size="sm" color="dimmed">
          {t("menu.stagingChecklistEmpty")}
        </Text>
      )}

      {state.kind === "ready" && state.prs.length > 0 && (
        <Accordion variant="contained">
          {state.prs.map((pr) => (
            <Accordion.Item
              key={pr.number}
              value={String(pr.number)}
            >
              <Accordion.Control>
                #{pr.number} {pr.title}
              </Accordion.Control>
              <Accordion.Panel>
                {pr.qcSteps ? (
                  <Stack spacing="xs">
                    <Anchor
                      href={pr.htmlUrl}
                      target="_blank"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("menu.stagingChecklistOpenPr")}
                    </Anchor>
                    {pr.qcSteps.map((step, i) => (
                      <Checkbox
                        key={i}
                        label={step}
                        checked={
                          checked[pr.number]?.has(i) ?? false
                        }
                        onChange={() => toggleStep(pr.number, i)}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Anchor href={pr.htmlUrl} target="_blank" size="sm">
                    {t("menu.stagingChecklistSeePr")}
                  </Anchor>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Modal>
  );
};

export default StagingChecklistModal;
