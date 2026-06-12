import { describe, it, expect } from "vitest"
import { 
  isTransitionLegal, 
  assertTransitionLegal, 
  getLegalTransitions,
  isTerminalStatus
} from "./state-machine"
import { SuggestionStatus } from "./types"

describe("State Machine", () => {
  describe("isTransitionLegal", () => {
    describe("from proposed", () => {
      it("should allow transition to discarded", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Discarded)
        ).toBe(true)
      })

      it("should allow transition to accepted", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Accepted)
        ).toBe(true)
      })

      it("should not allow transition to shipped", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Shipped)
        ).toBe(false)
      })

      it("should not allow transition to shipped-modified", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.ShippedModified)
        ).toBe(false)
      })

      it("should not allow transition to itself", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Proposed)
        ).toBe(false)
      })
    })

    describe("from discarded", () => {
      it("should not allow any transitions", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Discarded, SuggestionStatus.Proposed)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.Discarded, SuggestionStatus.Accepted)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.Discarded, SuggestionStatus.Shipped)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.Discarded, SuggestionStatus.ShippedModified)
        ).toBe(false)
      })
    })

    describe("from accepted", () => {
      it("should allow transition to shipped", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.Shipped)
        ).toBe(true)
      })

      it("should allow transition to shipped-modified", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.ShippedModified)
        ).toBe(true)
      })

      it("should not allow transition to proposed", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.Proposed)
        ).toBe(false)
      })

      it("should not allow transition to discarded", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.Discarded)
        ).toBe(false)
      })

      it("should not allow transition to itself", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.Accepted)
        ).toBe(false)
      })
    })

    describe("from shipped", () => {
      it("should not allow any transitions", () => {
        expect(
          isTransitionLegal(SuggestionStatus.Shipped, SuggestionStatus.Proposed)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.Shipped, SuggestionStatus.Discarded)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.Shipped, SuggestionStatus.Accepted)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.Shipped, SuggestionStatus.ShippedModified)
        ).toBe(false)
      })
    })

    describe("from shipped-modified", () => {
      it("should not allow any transitions", () => {
        expect(
          isTransitionLegal(SuggestionStatus.ShippedModified, SuggestionStatus.Proposed)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.ShippedModified, SuggestionStatus.Discarded)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.ShippedModified, SuggestionStatus.Accepted)
        ).toBe(false)
        expect(
          isTransitionLegal(SuggestionStatus.ShippedModified, SuggestionStatus.Shipped)
        ).toBe(false)
      })
    })
  })

  describe("assertTransitionLegal", () => {
    it("should not throw for legal transitions", () => {
      expect(() => {
        assertTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Discarded)
      }).not.toThrow()

      expect(() => {
        assertTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Accepted)
      }).not.toThrow()

      expect(() => {
        assertTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.Shipped)
      }).not.toThrow()

      expect(() => {
        assertTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.ShippedModified)
      }).not.toThrow()
    })

    it("should throw for illegal transitions", () => {
      expect(() => {
        assertTransitionLegal(SuggestionStatus.Proposed, SuggestionStatus.Shipped)
      }).toThrow('Illegal state transition: cannot transition from "proposed" to "shipped"')

      expect(() => {
        assertTransitionLegal(SuggestionStatus.Discarded, SuggestionStatus.Accepted)
      }).toThrow('Illegal state transition: cannot transition from "discarded" to "accepted"')

      expect(() => {
        assertTransitionLegal(SuggestionStatus.Shipped, SuggestionStatus.Proposed)
      }).toThrow('Illegal state transition: cannot transition from "shipped" to "proposed"')

      expect(() => {
        assertTransitionLegal(SuggestionStatus.Accepted, SuggestionStatus.Discarded)
      }).toThrow('Illegal state transition: cannot transition from "accepted" to "discarded"')
    })
  })

  describe("getLegalTransitions", () => {
    it("should return correct transitions for proposed", () => {
      const transitions = getLegalTransitions(SuggestionStatus.Proposed)
      expect(transitions).toEqual([
        SuggestionStatus.Discarded,
        SuggestionStatus.Accepted,
      ])
    })

    it("should return empty array for discarded", () => {
      const transitions = getLegalTransitions(SuggestionStatus.Discarded)
      expect(transitions).toEqual([])
    })

    it("should return correct transitions for accepted", () => {
      const transitions = getLegalTransitions(SuggestionStatus.Accepted)
      expect(transitions).toEqual([
        SuggestionStatus.Shipped,
        SuggestionStatus.ShippedModified,
      ])
    })

    it("should return empty array for shipped", () => {
      const transitions = getLegalTransitions(SuggestionStatus.Shipped)
      expect(transitions).toEqual([])
    })

    it("should return empty array for shipped-modified", () => {
      const transitions = getLegalTransitions(SuggestionStatus.ShippedModified)
      expect(transitions).toEqual([])
    })
  })

  describe("isTerminalStatus", () => {
    it("should return false for proposed", () => {
      expect(isTerminalStatus(SuggestionStatus.Proposed)).toBe(false)
    })

    it("should return true for discarded", () => {
      expect(isTerminalStatus(SuggestionStatus.Discarded)).toBe(true)
    })

    it("should return false for accepted", () => {
      expect(isTerminalStatus(SuggestionStatus.Accepted)).toBe(false)
    })

    it("should return true for shipped", () => {
      expect(isTerminalStatus(SuggestionStatus.Shipped)).toBe(true)
    })

    it("should return true for shipped-modified", () => {
      expect(isTerminalStatus(SuggestionStatus.ShippedModified)).toBe(true)
    })
  })
})
