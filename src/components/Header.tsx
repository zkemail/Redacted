"use client";

import { useState, useRef, useEffect } from "react";
import WhistleblowerLogo from "../assets/WhistleblowerLogo.svg";
import HelpIcon from "../assets/HelpIcon.svg";
import CloseIcon from "../assets/CloseIcon.svg";
import HamburgerIcon from "../assets/HamburgerIcon.svg";

export default function Header({
  onChangeEmail,
  onResetChanges,
}: {
  onChangeEmail: () => void;
  onResetChanges?: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        hamburgerRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !hamburgerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleResetChanges = () => {
    if (onResetChanges) {
      onResetChanges();
    }
    setIsMenuOpen(false);
  };

  const handleChangeEmail = () => {
    onChangeEmail();
    setIsMenuOpen(false);
  };

  return (
    <div>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-row items-center justify-between px-6 pt-6 py-4 md:py-2 bg-[#F5F3EF]">
        <div className="bg-[#EAEAEA] flex flex-row gap-2 px-4 py-2 items-center">
          <img
            src={WhistleblowerLogo}
            height={16}
            width={104}
            alt="Whistleblow Logo"
          />
        </div>
        <div className="flex flex-row gap-2 items-center relative">
          <div className="bg-[#EAEAEA] flex items-center justify-center px-4 py-2">
            <img
              src={HelpIcon}
              height={20}
              width={20}
              alt="Help Icon"
            />
          </div>
          <div
            ref={hamburgerRef}
            className="bg-[#EAEAEA] flex items-center justify-center px-4 py-2 cursor-pointer"
            onClick={handleMenuToggle}
          >
            <img
              src={isMenuOpen ? CloseIcon : HamburgerIcon}
              height={20}
              width={20}
              alt={isMenuOpen ? "Close Menu" : "Open Menu"}
            />
          </div>
          
          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div
              ref={menuRef}
              className="absolute top-full right-0 mt-2 bg-[#F5F3EF] shadow-[0px_1px_4px_0px_rgba(12,12,13,0.1),0px_1px_4px_0px_rgba(12,12,13,0.05)] px-4 py-2 min-w-[160px] z-50 flex flex-col gap-4"
            >
              <button
                onClick={handleResetChanges}
                className="block w-full text-left text-[#111314] text-base font-medium leading-5 hover:opacity-70 transition-opacity cursor-pointer"
              >
                Reset changes
              </button>
              <button
                onClick={handleChangeEmail}
                className="block w-full text-left text-[#111314] text-base font-medium leading-5 hover:opacity-70 transition-opacity cursor-pointer"
              >
                Change email
              </button>
              <button
                className="block w-full text-left text-[#111314] text-base font-medium leading-5 hover:opacity-70 transition-opacity cursor-pointer"
                onClick={() => setIsMenuOpen(false)}
              >
                Verify a Proof
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden md:block">
        <div className="bg-[#EAEAEA] fixed top-6 left-6 z-50 flex flex-row gap-4 px-4 py-2 items-center">
          <div>
            <img
              src={WhistleblowerLogo}
              height={16}
              width={104}
              alt="Whistleblow Logo"
            />
          </div>
          <div className="w-px h-6 bg-[#D4D4D4]" />
          <div className="text-[#111314]">Verify</div>
        </div>
        <div className="bg-[#EAEAEA] fixed top-6 right-6 z-50 flex flex-row gap-4 px-4 py-2 items-center text-[#111314]">
          <div
            onClick={onResetChanges}
            className={onResetChanges ? "cursor-pointer" : ""}
          >
            Reset Changes
          </div>
          <div className="w-px h-6 bg-[#D4D4D4]" />
          <div onClick={onChangeEmail} className="cursor-pointer">
            Change Email
          </div>
        </div>
      </div>
    </div>
  );
}
